# ObjectRegistry Data Flow Diagrams

This document contains Mermaid diagrams illustrating how ObjectRegistry powers the SMRT framework.

## High-Level Architecture

```mermaid
graph TB
    subgraph Application["Application Code"]
        Model["@smrt() decorator<br/>class Product extends SmrtObject"]
    end

    subgraph Registry["ObjectRegistry (Central Hub)"]
        ClassMeta["Class Metadata"]
        FieldDefs["Field Definitions"]
        Configs["Decorator Configs"]
        CollCache["Collection Cache"]
    end

    subgraph Generators["Code Generators"]
        CLI["CLIGenerator"]
        API["APIGenerator"]
        MCP["MCPGenerator"]
        Swagger["SwaggerGenerator"]
    end

    subgraph Output["Generated Artifacts"]
        CLICommands["CLI Commands"]
        RESTEndpoints["REST Endpoints"]
        MCPTools["MCP Tools"]
        OpenAPI["OpenAPI Spec"]
    end

    Model -->|"register()"| Registry
    Registry -->|"getAllClasses()<br/>getConfig()<br/>getFields()"| Generators
    Generators --> Output

    style Registry fill:#f9f,stroke:#333,stroke-width:4px
    style Generators fill:#bbf,stroke:#333,stroke-width:2px
```

## Zero-Config CLI Discovery

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant CLI as smrt CLI
    participant Registry as ObjectRegistry
    participant Gen as Generators

    Dev->>Dev: npm install @have/smrt
    Dev->>Dev: Define @smrt() classes
    Note over Dev: No configuration needed!

    Dev->>CLI: npx smrt objects
    CLI->>Registry: getAllClasses()
    Registry-->>CLI: [Product, Category, ...]
    CLI-->>Dev: Display registered objects

    Dev->>CLI: npx smrt products list
    CLI->>Registry: getConfig('Product')
    Registry-->>CLI: { api: {...}, mcp: {...} }
    CLI->>Registry: getFields('Product')
    Registry-->>CLI: { name: text(...), price: decimal(...) }
    CLI->>Gen: Generate command handler
    Gen-->>CLI: Execute list operation
    CLI-->>Dev: Display products

    Dev->>CLI: npx smrt mcp
    Note over CLI,Gen: MCP as built-in subcommand
    CLI->>Registry: getAllClasses()
    Registry-->>CLI: All registered objects
    CLI->>Gen: Generate MCP tools
    Gen-->>CLI: MCP server ready
    CLI-->>Dev: MCP server listening
```

## Object Registration Flow

```mermaid
sequenceDiagram
    participant Code as Developer Code
    participant Dec as @smrt Decorator
    participant Reg as ObjectRegistry
    participant DB as Database

    Code->>Dec: @smrt({ api: {...}, mcp: {...} })
    Dec->>Reg: register(Product, config)
    Note over Reg: Store config for later use

    Code->>Code: new Product({ name: 'Widget' })
    Code->>Code: await product.initialize()
    Code->>Reg: Analyze fields (if not cached)
    Reg->>Reg: Cache field definitions
    Code->>DB: CREATE TABLE IF NOT EXISTS
    DB-->>Code: Table ready

    Code->>Code: await product.save()
    Code->>DB: INSERT OR UPDATE
    DB-->>Code: Saved
```

## Generator Execution Pattern

```mermaid
flowchart TD
    Start[Generator.generate] --> GetAll[ObjectRegistry.getAllClasses]
    GetAll --> Loop{For each<br/>class}

    Loop -->|Next class| GetConfig[ObjectRegistry.getConfig]
    GetConfig --> GetFields[ObjectRegistry.getFields]
    GetFields --> CheckConfig{Check generator<br/>config}

    CheckConfig -->|api config| APIGen[Generate REST endpoints]
    CheckConfig -->|mcp config| MCPGen[Generate MCP tools]
    CheckConfig -->|cli config| CLIGen[Generate CLI commands]
    CheckConfig -->|swagger config| SwaggerGen[Generate OpenAPI spec]

    APIGen --> Loop
    MCPGen --> Loop
    CLIGen --> Loop
    SwaggerGen --> Loop

    Loop -->|Done| Output[Write generated code]
    Output --> End[Complete]

    style GetAll fill:#f96,stroke:#333,stroke-width:2px
    style GetConfig fill:#f96,stroke:#333,stroke-width:2px
    style GetFields fill:#f96,stroke:#333,stroke-width:2px
    style CheckConfig fill:#ff9,stroke:#333,stroke-width:2px
```

## Collection Singleton Pattern (Phase 4)

```mermaid
sequenceDiagram
    participant App as Application
    participant Reg as ObjectRegistry
    participant Cache as Collection Cache
    participant Coll as ProductCollection

    App->>Reg: getCollection('Product', options)
    Reg->>Cache: Check cache key<br/>"Product:{config}"

    alt Cache Miss
        Cache-->>Reg: Not found
        Reg->>Coll: await ProductCollection.create(options)
        Note over Coll: Initialize database,<br/>AI client, schema
        Coll-->>Reg: Initialized collection
        Reg->>Cache: Store instance
        Cache-->>Reg: Cached
        Reg-->>App: Return collection
    else Cache Hit
        Cache-->>Reg: Found instance
        Reg-->>App: Return cached collection
        Note over App: 60-80% faster!
    end

    App->>Reg: getCollection('Product', options)
    Note over App,Reg: Same config = same instance
    Reg->>Cache: Check cache
    Cache-->>Reg: Found
    Reg-->>App: Return cached collection
```

## Eager Loading Flow (Phase 5)

```mermaid
sequenceDiagram
    participant App as Application
    participant Coll as OrderCollection
    participant SQL as SQL Adapter
    participant DB as Database

    App->>Coll: list({ include: ['customerId', 'productId'] })
    Coll->>SQL: Build JOIN query

    SQL->>SQL: Generate SQL:<br/>SELECT t0.*, t1.*, t2.*<br/>FROM orders t0<br/>LEFT JOIN customers t1<br/>LEFT JOIN products t2

    SQL->>DB: Execute JOIN query
    DB-->>SQL: Flat result set

    SQL->>SQL: Hydrate objects:<br/>Unpack flat → nested
    Note over SQL: order._related = {<br/>  customerId: {...},<br/>  productId: {...}<br/>}

    SQL-->>Coll: Hydrated objects
    Coll-->>App: Return orders with _related

    App->>App: order.getRelated('customerId')
    Note over App: No DB query!<br/>40-70% faster
    App-->>App: Customer object
```

## Generator Consistency Pattern

```mermaid
graph TD
    Registry[ObjectRegistry]

    subgraph Shared["Shared Registry Access"]
        GetAll[getAllClasses]
        GetConfig[getConfig]
        GetFields[getFields]
    end

    subgraph Generators["All Generators"]
        CLI[CLIGenerator]
        API[APIGenerator]
        MCP[MCPGenerator]
        Swagger[SwaggerGenerator]
    end

    subgraph Logic["Consistent Logic"]
        Include[shouldInclude]
        Exclude[shouldExclude]
        Fields[Field Validation]
    end

    Registry --> Shared
    Shared --> Generators
    Generators --> Logic

    Logic -->|Generates| CLIOutput[CLI Commands]
    Logic -->|Generates| APIOutput[REST Endpoints]
    Logic -->|Generates| MCPOutput[MCP Tools]
    Logic -->|Generates| SwaggerOutput[OpenAPI Spec]

    style Registry fill:#f96,stroke:#333,stroke-width:4px
    style Shared fill:#9f9,stroke:#333,stroke-width:2px
    style Logic fill:#99f,stroke:#333,stroke-width:2px
```

## Decorator Configuration Flow

```mermaid
graph LR
    subgraph Developer["Developer Writes"]
        Code["@smrt({<br/>  api: { include: [...] },<br/>  mcp: { include: [...] },<br/>  cli: true<br/>})<br/>class Product"]
    end

    subgraph Registry["ObjectRegistry Stores"]
        Config["config.api<br/>config.mcp<br/>config.cli<br/>config.swagger"]
    end

    subgraph Generators["Generators Query"]
        APIQuery["getConfig('Product').api"]
        MCPQuery["getConfig('Product').mcp"]
        CLIQuery["getConfig('Product').cli"]
    end

    subgraph Output["Generates Output"]
        APIOut["POST /products ✓<br/>DELETE /products ✗"]
        MCPOut["list_products ✓<br/>delete_product ✗"]
        CLIOut["products create ✓<br/>products delete ✓"]
    end

    Code --> Config
    Config --> APIQuery
    Config --> MCPQuery
    Config --> CLIQuery

    APIQuery --> APIOut
    MCPQuery --> MCPOut
    CLIQuery --> CLIOut

    style Code fill:#ff9,stroke:#333,stroke-width:2px
    style Config fill:#f96,stroke:#333,stroke-width:3px
```

## CLI Command Structure

```mermaid
graph TD
    Root["npx smrt"]

    Root --> Objects["objects<br/>(discovery)"]
    Root --> MCP["mcp<br/>(MCP server)"]
    Root --> Generate["generate<br/>(code generation)"]
    Root --> ObjectCommands["<object-name><br/>(CRUD operations)"]

    Objects --> ListObjects["List all registered objects"]

    MCP --> MCPPort["--port 3000"]
    MCP --> MCPFilter["--objects Product,Category"]

    Generate --> GenAPI["api<br/>(REST endpoints)"]
    Generate --> GenMCP["mcp<br/>(MCP tools)"]
    Generate --> GenSwagger["swagger<br/>(OpenAPI spec)"]

    ObjectCommands --> List["list<br/>(query objects)"]
    ObjectCommands --> Get["get <id><br/>(fetch by ID)"]
    ObjectCommands --> Create["create<br/>(insert new)"]
    ObjectCommands --> Update["update <id><br/>(modify existing)"]
    ObjectCommands --> Delete["delete <id><br/>(remove)"]

    style Root fill:#f96,stroke:#333,stroke-width:3px
    style MCP fill:#9f9,stroke:#333,stroke-width:2px
    style ObjectCommands fill:#99f,stroke:#333,stroke-width:2px
```

## Field Schema Consistency

```mermaid
graph TB
    Model["Product Model<br/>name = text({ required: true })<br/>price = decimal({ min: 0 })"]

    Registry["ObjectRegistry<br/>getFields('Product')"]

    Model --> Registry

    subgraph Generators["All Generators Use Same Fields"]
        API["APIGenerator<br/>Validation Rules"]
        Swagger["SwaggerGenerator<br/>OpenAPI Schema"]
        CLI["CLIGenerator<br/>Input Prompts"]
        MCP["MCPGenerator<br/>Tool Parameters"]
    end

    Registry --> API
    Registry --> Swagger
    Registry --> CLI
    Registry --> MCP

    API --> APIOut["Validate:<br/>name required<br/>price >= 0"]
    Swagger --> SwaggerOut["Schema:<br/>name: string (required)<br/>price: number (min: 0)"]
    CLI --> CLIOut["Prompt:<br/>'name (required):'<br/>'price (min: 0):'"]
    MCP --> MCPOut["Parameters:<br/>name: { type: 'string', required: true }<br/>price: { type: 'number', minimum: 0 }"]

    style Registry fill:#f96,stroke:#333,stroke-width:3px
    style Generators fill:#9f9,stroke:#333,stroke-width:2px
```

## Extension Points

```mermaid
graph TD
    Base["SMRT Framework"]

    subgraph Extension["Extension Points"]
        CustomGen["Custom Generators"]
        CustomField["Custom Field Types"]
        CustomHook["Custom Lifecycle Hooks"]
        CustomAdapter["Custom Persistence"]
    end

    subgraph Access["Uses ObjectRegistry"]
        GenAccess["getAllClasses()<br/>getConfig()<br/>getFields()"]
        FieldAccess["Field definition API"]
        HookAccess["Hook registration"]
        AdapterAccess["Persistence interface"]
    end

    Base --> Extension
    Extension --> Access

    GenAccess --> UserGen["User's Custom Generator"]
    FieldAccess --> UserField["User's Custom Field"]
    HookAccess --> UserHook["User's Custom Hook"]
    AdapterAccess --> UserAdapter["User's Custom Adapter"]

    style Base fill:#f96,stroke:#333,stroke-width:3px
    style Extension fill:#9f9,stroke:#333,stroke-width:2px
    style Access fill:#99f,stroke:#333,stroke-width:2px
```

## Performance Optimization Stack

```mermaid
graph TB
    subgraph App["Application Layer"]
        Request["API Request:<br/>GET /orders?limit=100"]
    end

    subgraph Registry["Registry Layer (Phase 4)"]
        Cache["Collection Singleton Cache<br/>60-80% faster initialization"]
    end

    subgraph Collection["Collection Layer (Phase 5)"]
        Eager["Eager Loading with JOINs<br/>40-70% faster queries"]
    end

    subgraph Database["Database Layer"]
        Query["Single JOIN Query:<br/>SELECT t0.*, t1.*, t2.*<br/>FROM orders t0<br/>LEFT JOIN customers t1<br/>LEFT JOIN products t2"]
    end

    Request --> Cache
    Cache --> Eager
    Eager --> Query

    Query --> Result["Result:<br/>1 query instead of 201<br/>~70% total improvement"]

    style Cache fill:#9f9,stroke:#333,stroke-width:2px
    style Eager fill:#9f9,stroke:#333,stroke-width:2px
    style Result fill:#f96,stroke:#333,stroke-width:3px
```

## Summary: Registry-Driven Architecture

```mermaid
graph TB
    subgraph Philosophy["Core Philosophy"]
        Single["Single Source of Truth:<br/>ObjectRegistry"]
        Zero["Zero Configuration:<br/>Auto-discovery"]
        Consistent["Generator Consistency:<br/>Identical patterns"]
    end

    subgraph Benefits["Key Benefits"]
        Speed["60-80% faster initialization<br/>40-70% faster queries"]
        DX["Developer Experience:<br/>Define once, generate everywhere"]
        Safe["Type Safety:<br/>Full TypeScript support"]
    end

    subgraph Implementation["Implementation"]
        Decorator["@smrt() decorator"]
        Registry["ObjectRegistry"]
        Generators["4+ generators"]
        CLI["Zero-config CLI"]
    end

    Philosophy --> Benefits
    Benefits --> Implementation

    Implementation --> Output["REST API<br/>MCP Tools<br/>CLI Commands<br/>OpenAPI Spec<br/>TypeScript Client"]

    style Philosophy fill:#f96,stroke:#333,stroke-width:3px
    style Benefits fill:#9f9,stroke:#333,stroke-width:2px
    style Implementation fill:#99f,stroke:#333,stroke-width:2px
    style Output fill:#ff9,stroke:#333,stroke-width:2px
```
