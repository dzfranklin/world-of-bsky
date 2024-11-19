import {GlobeComponent} from "./GlobeComponent.tsx";
import {Orbit} from "./schema.ts";
import {useState} from "react";
import {OrbitPicker} from "./OrbitPicker.tsx";
import {useDebugMode} from "./debug.tsx";

export default function App() {
  useDebugMode();
  const [orbit, setOrbit] = useState<Orbit>('North');

  return (<div className="h-screen max-h-screen w-screen max-w-screen overflow-hidden">
    <div className="fixed top-5 right-5 w-32 pointer-events-none">
      <div className="bg-white pointer-events-auto">
        <OrbitPicker orbit={orbit} setOrbit={setOrbit}/>
      </div>
    </div>

    <GlobeComponent orbit={orbit} />
  </div>)
}
