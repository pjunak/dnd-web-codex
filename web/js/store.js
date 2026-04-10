import { FACTIONS, STATUS, CHARACTERS, LOCATIONS, EVENTS, RELATIONSHIPS, MYSTERIES, MAP_PINS } from './data.js';

export const Store = (() => {
  let _data            = null;
  let _serverAvailable = false;

  function _defaults() {
    return {
      characters:    JSON.parse(JSON.stringify(CHARACTERS)),
      relationships: JSON.parse(JSON.stringify(RELATIONSHIPS)),
      locations:     JSON.parse(JSON.stringify(LOCATIONS)),
      events:        JSON.parse(JSON.stringify(EVENTS)),
      mysteries:     JSON.parse(JSON.stringify(MYSTERIES)),
      mapPins:       JSON.parse(JSON.stringify(MAP_PINS)),
      factions:      JSON.parse(JSON.stringify(FACTIONS)),
    };
  }

  function _mergeDefaults() {
    const deleted  = new Set(_data.deletedDefaults || []);
    const savedIds = new Set(_data.characters.map(c => c.id));
    for (const c of CHARACTERS) {
      if (!savedIds.has(c.id) && !deleted.has(c.id)) {
        _data.characters.push(JSON.parse(JSON.stringify(c)));
      }
    }
    if (!_data.factions) {
      _data.factions = JSON.parse(JSON.stringify(FACTIONS));
    } else {
      for (const [id, fac] of Object.entries(FACTIONS)) {
        if (!_data.factions[id]) _data.factions[id] = JSON.parse(JSON.stringify(fac));
      }
    }
  }

  async function load() {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        _serverAvailable = true;
        const serverData = await res.json();
        if (serverData && serverData.characters) {
          _data = serverData;
          _mergeDefaults();
          return;
        }
        _data = _defaults();
        _persist();
        return;
      }
    } catch (e) {
      console.error('Store: server not reachable.', e);
    }
    _serverAvailable = false;
    _data = _defaults();
    window.dispatchEvent(new CustomEvent('store:server-unavailable'));
  }

  function init() {
    if (!_data) _data = _defaults();
  }

  function _persist() {
    if (!_data || !_serverAvailable) return false;
    fetch('/api/data', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(_data),
    }).catch(e => {
      console.warn('Store: server save failed.', e);
      window.dispatchEvent(new CustomEvent('store:save-failed'));
    });
    return true;
  }

  function _sync(type, action, payload) {
    if (!_serverAvailable) return false;
    fetch('/api/data', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type, action, payload }),
    }).then(res => {
      if (res.status === 401) window.dispatchEvent(new CustomEvent('store:auth-failed'));
    }).catch(e => {
      console.warn('Store: server sync failed.', e);
      window.dispatchEvent(new CustomEvent('store:save-failed'));
    });
    return true;
  }

  async function uploadPortrait(file, charId) {
    if (!charId) throw new Error('uploadPortrait: charId is required.');
    if (!_serverAvailable) throw new Error('Server není dostupný — nelze nahrát obrázek.');
    const form     = new FormData();
    form.append('portrait', file);
    const endpoint = `/api/portrait/${encodeURIComponent(charId)}`;
    const res = await fetch(endpoint, { method: 'POST', body: form });
    if (res.ok) return (await res.json()).url;
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('store:auth-failed'));
      throw new Error('Neznámé nebo chybějící heslo.');
    }
    throw new Error('Nahrání portrétu selhalo.');
  }

  function deletePortrait(url) {
    if (!_serverAvailable || !url || !url.startsWith('/portraits/')) return;
    const identifier = url.slice('/portraits/'.length).split('/')[0];
    if (!identifier) return;
    fetch(`/api/portrait/${encodeURIComponent(identifier)}`, { method: 'DELETE' })
      .then(res => { if (res.status === 401) window.dispatchEvent(new CustomEvent('store:auth-failed')); })
      .catch(e => console.warn('Store: portrait delete failed.', e));
  }

  function getCharacters()    { init(); return _data.characters; }
  function getRelationships() { init(); return _data.relationships; }
  function getLocations()     { init(); return _data.locations; }
  function getEvents()        { init(); return _data.events; }
  function getMysteries()     { init(); return _data.mysteries; }
  function getMapPins()       { init(); return _data.mapPins || (_data.mapPins = JSON.parse(JSON.stringify(MAP_PINS))); }
  function getFactions()      { init(); return _data.factions; }
  function getFaction(id)     { return getFactions()[id] || null; }
  function getStatusMap()     { return STATUS; }

  function getCharacter(id) { return getCharacters().find(c => c.id === id) || null; }
  function getLocation(id)  { return getLocations().find(l => l.id === id) || null; }
  function getEvent(id)     { return getEvents().find(e => e.id === id) || null; }
  function getMystery(id)   { return getMysteries().find(m => m.id === id) || null; }

  function saveCharacter(char) {
    init();
    const idx = _data.characters.findIndex(c => c.id === char.id);
    if (idx >= 0) _data.characters[idx] = char; else _data.characters.push(char);
    return _sync('characters', 'save', char);
  }

  function deleteCharacter(id) {
    init();
    const char = _data.characters.find(c => c.id === id);
    if (char?.portrait) deletePortrait(char.portrait);
    if (CHARACTERS.some(c => c.id === id)) {
      if (!_data.deletedDefaults) _data.deletedDefaults = [];
      if (!_data.deletedDefaults.includes(id)) _data.deletedDefaults.push(id);
    }
    _data.characters    = _data.characters.filter(c => c.id !== id);
    _data.relationships = _data.relationships.filter(r => r.source !== id && r.target !== id);
    _data.events        = (_data.events    || []).map(e => ({ ...e, characters: (e.characters    || []).filter(cid => cid !== id) }));
    _data.mysteries     = (_data.mysteries || []).map(m => ({ ...m, characters: (m.characters    || []).filter(cid => cid !== id) }));
    return _sync('characters', 'delete', { id });
  }

  function saveRelationship(rel) {
    init();
    const key = r => `${r.source}||${r.target}||${r.type}`;
    const k   = key(rel);
    const idx = _data.relationships.findIndex(r => key(r) === k);
    if (idx >= 0) _data.relationships[idx] = rel; else _data.relationships.push(rel);
    return _sync('relationships', 'save', rel);
  }

  function deleteRelationship(source, target, type) {
    init();
    _data.relationships = _data.relationships.filter(
      r => !(r.source === source && r.target === target && r.type === type)
    );
    return _sync('relationships', 'delete', { source, target, type });
  }

  function saveLocation(loc) {
    init();
    const idx = _data.locations.findIndex(l => l.id === loc.id);
    if (idx >= 0) _data.locations[idx] = loc; else _data.locations.push(loc);
    return _sync('locations', 'save', loc);
  }

  function deleteLocation(id) {
    init();
    _data.locations = _data.locations.filter(l => l.id !== id);
    return _sync('locations', 'delete', { id });
  }

  function saveEvent(evt) {
    init();
    const idx = _data.events.findIndex(e => e.id === evt.id);
    if (idx >= 0) _data.events[idx] = evt; else _data.events.push(evt);
    return _sync('events', 'save', evt);
  }

  function deleteEvent(id) {
    init();
    _data.events = _data.events.filter(e => e.id !== id);
    return _sync('events', 'delete', { id });
  }

  function saveMystery(mys) {
    init();
    const idx = _data.mysteries.findIndex(m => m.id === mys.id);
    if (idx >= 0) _data.mysteries[idx] = mys; else _data.mysteries.push(mys);
    return _sync('mysteries', 'save', mys);
  }

  function deleteMystery(id) {
    init();
    _data.mysteries = _data.mysteries.filter(m => m.id !== id);
    return _sync('mysteries', 'delete', { id });
  }

  function saveFaction(id, fac) {
    init();
    _data.factions[id] = fac;
    return _sync('factions', 'save', { id, data: fac });
  }

  function deleteFaction(id) {
    init();
    delete _data.factions[id];
    return _sync('factions', 'delete', { id });
  }

  function saveMapPin(pin) {
    init();
    const pins = getMapPins();
    const idx  = pins.findIndex(p => p.id === pin.id);
    if (idx >= 0) pins[idx] = pin; else pins.push(pin);
    return _sync('mapPins', 'save', pin);
  }

  function deleteMapPin(id) {
    init();
    _data.mapPins = getMapPins().filter(p => p.id !== id);
    return _sync('mapPins', 'delete', { id });
  }

  function generateId(name) {
    return name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 40);
  }

  function reset() {
    _data = _defaults();
    _persist();
  }

  function exportJS() {
    init();
    const ts = new Date().toLocaleString('cs-CZ');
    return [
      `// O Barvách Draků — Export dat (${ts})`,
      `// Vlož jako obsah js/data.js`,
      ``,
      `const FACTIONS = ${JSON.stringify(_data.factions, null, 2)};`,
      ``,
      `const CHARACTERS = ${JSON.stringify(_data.characters, null, 2)};`,
      ``,
      `const RELATIONSHIPS = ${JSON.stringify(_data.relationships, null, 2)};`,
      ``,
      `const LOCATIONS = ${JSON.stringify(_data.locations, null, 2)};`,
      ``,
      `const EVENTS = ${JSON.stringify(_data.events, null, 2)};`,
      ``,
      `const MYSTERIES = ${JSON.stringify(_data.mysteries, null, 2)};`,
    ].join('\n');
  }

  function importJSON(json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed.characters) _data = { ..._defaults(), ...parsed };
      else throw new Error('Neplatný formát');
      _persist();
      return true;
    } catch(e) {
      return false;
    }
  }

  function exportJSON() {
    init();
    const ts = new Date().toLocaleString('cs-CZ');
    return JSON.stringify({
      _version:      3,
      _exported:     ts,
      factions:      _data.factions,
      characters:    _data.characters,
      relationships: _data.relationships,
      locations:     _data.locations,
      events:        _data.events,
      mysteries:     _data.mysteries,
      mapPins:       getMapPins(),
    }, null, 2);
  }

  return {
    load, init,
    uploadPortrait, deletePortrait,
    getCharacters, getRelationships, getLocations, getEvents, getMysteries,
    getMapPins, getFactions, getFaction, getStatusMap,
    getCharacter, getLocation, getEvent, getMystery,
    saveCharacter, deleteCharacter,
    saveRelationship, deleteRelationship,
    saveLocation, deleteLocation,
    saveEvent, deleteEvent,
    saveMystery, deleteMystery,
    saveMapPin, deleteMapPin,
    saveFaction, deleteFaction,
    generateId, reset, exportJS, exportJSON, importJSON,
  };
})();
