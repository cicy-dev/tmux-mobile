console.log('[ttyd] Injecting tmux-app...');

const injectHtml = `

    <script type="module">import { injectIntoGlobalHook } from "https://ttyd-dev.cicy.de5.net/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;</script>

    <script type="module" src="https://ttyd-dev.cicy.de5.net/@vite/client"></script>

     <style>
           body { background: #1f2937; }

      *::-webkit-scrollbar { width: 6px; height: 6px; }
      *::-webkit-scrollbar-track { background: #1f2937; }
      *::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 3px; }
      *::-webkit-scrollbar-thumb:hover { background: #6b7280; }
      #terminal-container{
        margin-top:32px!important
      }
      .xterm .xterm-viewport::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
      .xterm .xterm-viewport { scrollbar-width: none !important; -ms-overflow-style: none !important; }
    </style>

    
    <div id="root"></div>
    <script type="module" src="https://ttyd-dev.cicy.de5.net/src/main.tsx"></script>

`;

document.open();
document.write(injectHtml);
document.close();
