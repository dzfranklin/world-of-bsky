import {Orbit, orbitList} from "./schema.ts";

export function OrbitPicker({orbit, setOrbit}: { orbit: Orbit, setOrbit: (_: Orbit) => void }) {
  return (<fieldset className="p-2 border border-gray-400 relative">
    <legend className="absolute -top-[1.1rem] translate-y-[0.5rem] px-1 bg-white rounded text-xs text-gray-800">Orbit</legend>
    {orbitList.map(entry => (
      <label key={entry} className="text-sm block p-0.5">
        <input type="radio" checked={entry === orbit} onChange={() => setOrbit(entry)} className="mr-1" />
        {entry}
      </label>
    ))}
  </fieldset>)
}
