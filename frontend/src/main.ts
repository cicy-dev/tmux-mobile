import './style.css';

interface ApiHealthResponse {
  status: string;
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="text-align: center; margin-top: 50px;">
    <h1>Hello World! v1.0.3</h1>
    <p>Welcome to Vite + TypeScript</p>
    <p>Server Status: <span id="server-status">Loading...</span></p>
    <div id="api-result">Loading...</div>
  </div>
`;

async function fetchApiHealth() {
  try {
    const res = await fetch('/api/health');
    const data: ApiHealthResponse = await res.json();
    
    document.querySelector<HTMLSpanElement>('#server-status')!.textContent = data.status;
    document.querySelector<HTMLDivElement>('#api-result')!.innerHTML = `
      <h3>API Health Result:</h3>
      <pre>${JSON.stringify(data, null, 2)}</pre>
    `;
  } catch (e) {
    const error = e as Error;
    document.querySelector<HTMLSpanElement>('#server-status')!.textContent = 'Error';
    document.querySelector<HTMLDivElement>('#api-result')!.textContent = 'API Error: ' + error.message;
  }
}

fetchApiHealth();
