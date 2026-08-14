import { Recorder } from "./components/Recorder";

function App() {
  return (
    <>
      <h1>ProcureCV</h1>
      <p className="hint">Real-time multilingual (Hindi/English) speech-to-text</p>
      <Recorder />
    </>
  );
}

export default App;
