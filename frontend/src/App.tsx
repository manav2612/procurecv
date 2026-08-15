import { useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { Recorder } from "./components/Recorder";
import { ToastProvider } from "./components/Toaster";

type View = "record" | "dashboard";

function App() {
  const [view, setView] = useState<View>("record");

  return (
    <ToastProvider>
      <h1>Speech to Text</h1>
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
    </ToastProvider>
  );
}

export default App;
