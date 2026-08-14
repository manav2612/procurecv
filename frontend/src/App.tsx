import { useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { Recorder } from "./components/Recorder";

type View = "record" | "dashboard";

function App() {
  const [view, setView] = useState<View>("record");

  return (
    <>
      <h1>ProcureCV</h1>
      <p className="hint">Real-time multilingual (Hindi/English) speech-to-text</p>

      <nav>
        <button className={view === "record" ? "active" : ""} onClick={() => setView("record")}>
          Record
        </button>
        <button
          className={view === "dashboard" ? "active" : ""}
          onClick={() => setView("dashboard")}
        >
          Dashboard
        </button>
      </nav>

      {view === "record" ? <Recorder /> : <Dashboard />}
    </>
  );
}

export default App;
