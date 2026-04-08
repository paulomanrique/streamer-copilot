export default function App() {
  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        background: '#030712',
      }}
    >
      <iframe
        title="Streamer Copilot Mock"
        src="/mockup/index.html"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          background: '#030712',
        }}
      />
    </main>
  );
}
