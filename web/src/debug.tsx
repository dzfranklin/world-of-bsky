import {useEffect} from "react";
import Stats from "stats.js";

export function useDebugMode() {
  useEffect(() => {
    if (localStorage.getItem('debug') === null) {
      console.info('Run localStorage.setItem("debug", "true") and reload to enable debug mode');
      return;
    } else {
      console.info('Run localStorage.removeItem("debug") and reload to disable debug mode');
    }

    const stats = new Stats();

    stats.showPanel(0);
    document.body.append(stats.dom);

    let stopped = false;
    requestAnimationFrame(function loop() {
      if (stopped) return;
      stats.update();
      requestAnimationFrame(loop);
    });

    return () => {
      stopped = true;
      stats.dom.remove();
    }
  }, []);
}
