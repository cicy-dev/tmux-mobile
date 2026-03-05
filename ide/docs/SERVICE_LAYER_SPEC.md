# API Service Layer Architecture

## Principle
**All API calls MUST go through the service layer. Direct fetch() calls are prohibited.**

---

## Architecture

```
Component → Service → ApiClient → Backend API
```

**❌ WRONG**:
```typescript
// Direct fetch in component
const response = await fetch(getApiUrl('/api/tmux/panes'), {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

**✅ CORRECT**:
```typescript
// Use service
import { agentsService } from '../services/agentsService';
const agents = await agentsService.getAll();
```

---

## Service Layer Structure

```
src/services/
├── api.ts              # ApiClient base class
├── tokenManager.ts     # Token management
├── paneManager.ts      # Pane selection
├── agentsService.ts    # Agents operations
├── panesService.ts     # Panes operations
├── commandsService.ts  # Commands operations
└── index.ts            # Export all services
```

---

## Implementation

### 1. Base ApiClient (Already Created)

`src/services/api.ts` - Low-level HTTP client

### 2. Domain Services

Each domain gets its own service file:

#### agentsService.ts
```typescript
import ApiClient from './api';

class AgentsService {
  private api: ApiClient;

  constructor(api: ApiClient) {
    this.api = api;
  }

  async getAll() {
    return this.api.getAgents();
  }

  async create(data: { win_name: string; workspace: string; init_script: string }) {
    return this.api.createAgent(data);
  }

  async remove(paneId: string, agentId?: number) {
    if (agentId) {
      await this.api.unbindAgent(agentId);
    }
    return this.api.deleteAgent(paneId);
  }

  async bind(paneId: string, agentName: string) {
    return this.api.bindAgent(paneId, agentName);
  }

  async restart(paneId: string) {
    return this.api.restartAgent(paneId);
  }

  async toggleMouse(paneId: string) {
    return this.api.toggleMouse(paneId);
  }
}

export default AgentsService;
```

#### panesService.ts
```typescript
import ApiClient from './api';

class PanesService {
  private api: ApiClient;

  constructor(api: ApiClient) {
    this.api = api;
  }

  async getAll() {
    return this.api.getPanes();
  }

  async getConfig(paneId: string) {
    return this.api.getPaneConfig(paneId);
  }

  async updateConfig(paneId: string, config: any) {
    return this.api.updatePaneConfig(paneId, config);
  }

  async capture(paneId: string) {
    return this.api.capturePane(paneId);
  }
}

export default PanesService;
```

#### commandsService.ts
```typescript
import ApiClient from './api';

class CommandsService {
  private api: ApiClient;

  constructor(api: ApiClient) {
    this.api = api;
  }

  async send(target: string, command: string) {
    return this.api.sendCommand(target, command);
  }

  async correctEnglish(text: string) {
    return this.api.correctEnglish(text);
  }
}

export default CommandsService;
```

### 3. Service Factory

`src/services/index.ts`:
```typescript
import ApiClient from './api';
import AgentsService from './agentsService';
import PanesService from './panesService';
import CommandsService from './commandsService';
import { TokenManager } from './tokenManager';
import { PaneManager } from './paneManager';

export class ServiceFactory {
  private static api: ApiClient | null = null;
  private static agents: AgentsService | null = null;
  private static panes: PanesService | null = null;
  private static commands: CommandsService | null = null;

  static init(token: string) {
    this.api = new ApiClient(token);
    this.agents = new AgentsService(this.api);
    this.panes = new PanesService(this.api);
    this.commands = new CommandsService(this.api);
  }

  static getAgentsService(): AgentsService {
    if (!this.agents) throw new Error('Services not initialized');
    return this.agents;
  }

  static getPanesService(): PanesService {
    if (!this.panes) throw new Error('Services not initialized');
    return this.panes;
  }

  static getCommandsService(): CommandsService {
    if (!this.commands) throw new Error('Services not initialized');
    return this.commands;
  }
}

export { TokenManager, PaneManager };
```

---

## Usage in Components

### Option 1: Via AppContext (Recommended)

Update `AppContext.tsx`:
```typescript
import { ServiceFactory } from '../services';

export const AppProvider = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const cachedToken = TokenManager.init();
    if (cachedToken) {
      setToken(cachedToken);
      ServiceFactory.init(cachedToken); // Initialize services
    }
  }, []);

  const value = {
    token,
    agentsService: ServiceFactory.getAgentsService(),
    panesService: ServiceFactory.getPanesService(),
    commandsService: ServiceFactory.getCommandsService(),
    // ...
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
```

Use in component:
```typescript
const MyComponent = () => {
  const { agentsService } = useApp();
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    agentsService.getAll()
      .then(data => setAgents(Object.values(data)))
      .catch(err => console.error(err));
  }, []);

  const handleDelete = async (paneId: string) => {
    await agentsService.remove(paneId);
    setAgents(agents.filter(a => a.pane_id !== paneId));
  };

  return <div>...</div>;
};
```

### Option 2: Direct Import (Not Recommended)

```typescript
import { ServiceFactory } from '../services';

const MyComponent = () => {
  const agentsService = ServiceFactory.getAgentsService();
  // Use service...
};
```

---

## Benefits

1. ✅ **Single Responsibility** - Services handle API logic, components handle UI
2. ✅ **Testability** - Easy to mock services
3. ✅ **Consistency** - All API calls follow same pattern
4. ✅ **Error Handling** - Centralized in service layer
5. ✅ **Type Safety** - Services provide typed interfaces
6. ✅ **Maintainability** - API changes only affect service layer

---

## Migration Checklist

### Step 1: Create Service Files
- [ ] `src/services/agentsService.ts`
- [ ] `src/services/panesService.ts`
- [ ] `src/services/commandsService.ts`
- [ ] `src/services/index.ts` (ServiceFactory)

### Step 2: Update AppContext
- [ ] Initialize ServiceFactory in AppContext
- [ ] Expose services via context

### Step 3: Migrate Components
- [ ] Find all `fetch()` calls: `grep -r "fetch(" src/components/`
- [ ] Replace with service calls
- [ ] Remove direct API imports

### Step 4: Enforce Rule
- [ ] Add ESLint rule to prevent direct fetch
- [ ] Add comment in code review checklist

---

## ESLint Rule (Optional)

`.eslintrc.js`:
```javascript
module.exports = {
  rules: {
    'no-restricted-globals': ['error', {
      name: 'fetch',
      message: 'Use service layer instead of direct fetch()'
    }]
  }
};
```

---

## Testing

### Mock Services
```typescript
// __mocks__/services.ts
export const mockAgentsService = {
  getAll: jest.fn(),
  create: jest.fn(),
  remove: jest.fn(),
};

// Component.test.tsx
jest.mock('../services', () => ({
  ServiceFactory: {
    getAgentsService: () => mockAgentsService
  }
}));
```

---

## Example: Before & After

### Before
```typescript
// AgentsRightView.tsx
const AgentsRightView = ({ token }) => {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    fetch(getApiUrl('/api/tmux/status/all'), {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setAgents(Object.values(data)))
      .catch(err => console.error(err));
  }, [token]);

  const handleDelete = async (paneId: string) => {
    await fetch(getApiUrl(`/api/tmux/panes/${paneId}`), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    setAgents(agents.filter(a => a.pane_id !== paneId));
  };
};
```

### After
```typescript
// AgentsRightView.tsx
const AgentsRightView = () => {
  const { agentsService } = useApp();
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    agentsService.getAll()
      .then(data => setAgents(Object.values(data)))
      .catch(err => console.error(err));
  }, []);

  const handleDelete = async (paneId: string) => {
    await agentsService.remove(paneId);
    setAgents(agents.filter(a => a.pane_id !== paneId));
  };
};
```

**Improvements**:
- ✅ No token prop drilling
- ✅ No manual header construction
- ✅ Cleaner, more readable code
- ✅ Easier to test
- ✅ Consistent error handling
