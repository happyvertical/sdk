# Migrating Existing Code to SMRT Framework

## Overview

This guide demonstrates how to migrate existing TypeScript classes to use the SMRT framework, preserving functionality while adding powerful new capabilities.

## Migration Example: User Management System

### Original TypeScript Class

```typescript
// Original User class (before SMRT)
export interface UserData {
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'admin' | 'moderator';
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
  preferences?: Record<string, any>;
}

export class User {
  public id: string;
  public email: string;
  public firstName: string;
  public lastName: string;
  public role: 'user' | 'admin' | 'moderator';
  public isActive: boolean;
  public createdAt: Date;
  public updatedAt: Date;
  public lastLoginAt?: Date;
  public preferences: Record<string, any>;

  private db: DatabaseConnection;

  constructor(data: UserData, db: DatabaseConnection) {
    this.id = data.id || this.generateId();
    this.email = data.email;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.role = data.role;
    this.isActive = data.isActive;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.lastLoginAt = data.lastLoginAt;
    this.preferences = data.preferences || {};
    this.db = db;
  }

  // Original methods
  public getFullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  public async save(): Promise<void> {
    this.updatedAt = new Date();

    const query = this.id ?
      'UPDATE users SET email=?, first_name=?, last_name=?, role=?, is_active=?, updated_at=?, last_login_at=?, preferences=? WHERE id=?' :
      'INSERT INTO users (email, first_name, last_name, role, is_active, created_at, updated_at, last_login_at, preferences, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

    const params = this.id ?
      [this.email, this.firstName, this.lastName, this.role, this.isActive, this.updatedAt, this.lastLoginAt, JSON.stringify(this.preferences), this.id] :
      [this.email, this.firstName, this.lastName, this.role, this.isActive, this.createdAt, this.updatedAt, this.lastLoginAt, JSON.stringify(this.preferences), this.id];

    await this.db.execute(query, params);
  }

  public async delete(): Promise<void> {
    await this.db.execute('UPDATE users SET is_active = false WHERE id = ?', [this.id]);
  }

  public static async findById(id: string, db: DatabaseConnection): Promise<User | null> {
    const result = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return result.length > 0 ? new User(result[0], db) : null;
  }

  public static async findByEmail(email: string, db: DatabaseConnection): Promise<User | null> {
    const result = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    return result.length > 0 ? new User(result[0], db) : null;
  }

  public async updateLastLogin(): Promise<void> {
    this.lastLoginAt = new Date();
    await this.save();
  }

  public isAdmin(): boolean {
    return this.role === 'admin';
  }

  public canModerate(): boolean {
    return this.role === 'admin' || this.role === 'moderator';
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

// Collection class
export class UserRepository {
  constructor(private db: DatabaseConnection) {}

  async findActiveUsers(): Promise<User[]> {
    const results = await this.db.query('SELECT * FROM users WHERE is_active = true ORDER BY created_at DESC');
    return results.map(result => new User(result, this.db));
  }

  async findByRole(role: string): Promise<User[]> {
    const results = await this.db.query('SELECT * FROM users WHERE role = ? AND is_active = true', [role]);
    return results.map(result => new User(result, this.db));
  }

  async searchByName(query: string): Promise<User[]> {
    const searchPattern = `%${query}%`;
    const results = await this.db.query(
      'SELECT * FROM users WHERE (first_name LIKE ? OR last_name LIKE ?) AND is_active = true',
      [searchPattern, searchPattern]
    );
    return results.map(result => new User(result, this.db));
  }
}
```

### Step 1: Migrated SMRT Object

```typescript
// Migrated User class (SMRT version)
import { BaseObject, smrt, text, boolean, datetime, json } from '@have/smrt';

// Define the interface for type safety (optional but recommended)
export interface UserOptions {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: 'user' | 'admin' | 'moderator';
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
  preferences?: Record<string, any>;
}

@smrt({
  api: {
    exclude: ['delete'], // Use soft delete only
    middleware: ['auth', 'validation']
  },
  cli: {
    include: ['list', 'get', 'create', 'update']
  },
  mcp: {
    include: ['list', 'get', 'create', 'update', 'search']
  }
})
export class User extends BaseObject<UserOptions> {
  // Field definitions with validation
  email = text({
    required: true,
    unique: true,
    pattern: '^[^@]+@[^@]+\\.[^@]+$',
    index: true
  });

  firstName = text({
    required: true,
    maxLength: 50
  });

  lastName = text({
    required: true,
    maxLength: 50
  });

  role = text({
    required: true,
    default: 'user'
  }); // Could also use enum validation

  isActive = boolean({
    default: true,
    index: true
  });

  lastLoginAt = datetime();

  preferences = json({
    default: {}
  });

  constructor(options: UserOptions = {}) {
    super(options);
    Object.assign(this, options);
  }

  // Lifecycle hooks
  async beforeSave() {
    // Validate role
    const validRoles = ['user', 'admin', 'moderator'];
    if (this.role && !validRoles.includes(this.role)) {
      throw new Error(`Invalid role: ${this.role}`);
    }

    // Generate slug from name if not exists
    if (!this.slug && this.firstName && this.lastName) {
      this.slug = await this.generateUserSlug();
    }

    // Update timestamp
    this.updated_at = new Date();
  }

  async afterCreate() {
    console.log(`Created new user: ${this.getFullName()} (${this.email})`);
  }

  // Preserved original methods
  getFullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  async updateLastLogin(): Promise<void> {
    this.lastLoginAt = new Date();
    await this.save();
  }

  isAdmin(): boolean {
    return this.role === 'admin';
  }

  canModerate(): boolean {
    return this.role === 'admin' || this.role === 'moderator';
  }

  // Enhanced methods with AI
  async generatePersonalizedWelcome(): Promise<string> {
    return await this.do(`
      Create a personalized welcome message for this user:
      Name: ${this.getFullName()}
      Role: ${this.role}
      Join Date: ${this.created_at}
      Preferences: ${JSON.stringify(this.preferences)}

      Make it friendly, professional, and role-appropriate.
      Length: 2-3 sentences.
    `);
  }

  async suggestPreferences(): Promise<Record<string, any>> {
    const suggestions = await this.do(`
      Based on this user profile, suggest relevant preferences:
      Role: ${this.role}
      Current preferences: ${JSON.stringify(this.preferences)}

      Suggest useful settings and preferences that would improve their experience.
      Return as JSON object with key-value pairs.
    `);

    try {
      return JSON.parse(suggestions);
    } catch {
      return {};
    }
  }

  async isProfileComplete(): Promise<boolean> {
    return await this.is(`
      This user profile is complete and professional:
      - Has valid email address
      - First and last name are provided
      - Role is appropriate and set
      - Has logged in recently (within 30 days)
      - Profile appears to be actively used
    `);
  }

  async analyzeActivity(): Promise<string> {
    return await this.describe(`
      Analyze this user's activity and engagement:
      Role: ${this.role}
      Join Date: ${this.created_at}
      Last Login: ${this.lastLoginAt || 'Never'}
      Status: ${this.isActive ? 'Active' : 'Inactive'}

      Provide insights on engagement level and recommendations.
    `);
  }

  // Security methods
  async activate(): Promise<void> {
    this.isActive = true;
    await this.save();
  }

  async deactivate(): Promise<void> {
    this.isActive = false;
    await this.save();
  }

  // Utility methods
  private async generateUserSlug(): Promise<string> {
    const base = `${this.firstName}-${this.lastName}`.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Ensure uniqueness (inherited from BaseObject)
    return await this.getSlug(base);
  }

  // Override soft delete behavior
  async delete(): Promise<void> {
    await this.deactivate(); // Soft delete by deactivating
  }
}
```

### Step 2: Migrated Collection Class

```typescript
// Migrated UserRepository to UserCollection
import { BaseCollection } from '@have/smrt';
import { User } from './user';

export class UserCollection extends BaseCollection<User> {
  static readonly _itemClass = User;

  constructor(options: any) {
    super(options);
  }

  // Preserved original methods with SMRT patterns
  async findActiveUsers(): Promise<User[]> {
    return this.list({
      where: { isActive: true },
      orderBy: 'created_at DESC'
    });
  }

  async findByRole(role: string): Promise<User[]> {
    return this.list({
      where: {
        role,
        isActive: true
      },
      orderBy: 'lastName ASC'
    });
  }

  async searchByName(query: string): Promise<User[]> {
    return this.list({
      where: {
        $or: [
          { 'firstName like': `%${query}%` },
          { 'lastName like': `%${query}%` }
        ],
        isActive: true
      },
      orderBy: 'lastName ASC'
    });
  }

  // Enhanced methods
  async findRecentlyActive(days: number = 30): Promise<User[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return this.list({
      where: {
        'lastLoginAt >': cutoffDate,
        isActive: true
      },
      orderBy: 'lastLoginAt DESC'
    });
  }

  async findInactiveUsers(days: number = 90): Promise<User[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return this.list({
      where: {
        $or: [
          { 'lastLoginAt <': cutoffDate },
          { lastLoginAt: null }
        ],
        isActive: true
      },
      orderBy: 'created_at ASC'
    });
  }

  // AI-enhanced methods
  async searchSemantic(query: string, threshold: number = 7): Promise<User[]> {
    const users = await this.list({
      where: { isActive: true }
    });

    const results = [];

    for (const user of users) {
      const relevance = await user.do(`
        Rate how well this user matches the search query "${query}"
        on a scale of 1-10. Consider name, role, and general profile fit.

        User: ${user.getFullName()}
        Role: ${user.role}
        Email: ${user.email}

        Respond with only the number.
      `);

      const score = parseInt(relevance);
      if (score >= threshold) {
        results.push({ user, relevance: score });
      }
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .map(r => r.user);
  }

  async analyzeUserBase(): Promise<string> {
    const users = await this.list({});
    const activeUsers = users.filter(u => u.isActive);
    const adminUsers = users.filter(u => u.role === 'admin');

    const sample = users.slice(0, 5);

    const analysis = await users[0]?.do(`
      Analyze this user base and provide insights:

      Total Users: ${users.length}
      Active Users: ${activeUsers.length}
      Admin Users: ${adminUsers.length}

      Sample users:
      ${sample.map((u, i) =>
        `${i + 1}. ${u.getFullName()} - ${u.role} - ${u.isActive ? 'Active' : 'Inactive'}`
      ).join('\n')}

      Provide insights on:
      - User engagement and activity patterns
      - Role distribution and access levels
      - Growth trends and user lifecycle
      - Recommendations for user management
    `);

    return analysis || 'Unable to generate analysis';
  }

  // Bulk operations
  async bulkActivate(userIds: string[]): Promise<User[]> {
    const users = await Promise.all(
      userIds.map(id => this.get(id))
    );

    const validUsers = users.filter(Boolean) as User[];

    for (const user of validUsers) {
      await user.activate();
    }

    return validUsers;
  }

  async bulkUpdateRole(userIds: string[], newRole: string): Promise<User[]> {
    const users = await Promise.all(
      userIds.map(id => this.get(id))
    );

    const validUsers = users.filter(Boolean) as User[];

    for (const user of validUsers) {
      user.role = newRole as any;
      await user.save();
    }

    return validUsers;
  }

  // Analytics
  async getRoleDistribution(): Promise<Record<string, number>> {
    const users = await this.list({ where: { isActive: true } });
    const distribution: Record<string, number> = {};

    for (const user of users) {
      distribution[user.role] = (distribution[user.role] || 0) + 1;
    }

    return distribution;
  }

  async getActivityMetrics(): Promise<any> {
    const users = await this.list({});
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      total: users.length,
      active: users.filter(u => u.isActive).length,
      recentlyActive: users.filter(u =>
        u.lastLoginAt && u.lastLoginAt > thirtyDaysAgo
      ).length,
      neverLoggedIn: users.filter(u => !u.lastLoginAt).length,
      byRole: await this.getRoleDistribution()
    };
  }
}
```

### Step 3: Usage Comparison

#### Before (Original)
```typescript
// Original usage
const db = new DatabaseConnection();
const userRepo = new UserRepository(db);

// Create user
const userData: UserData = {
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
  role: 'user',
  isActive: true
};

const user = new User(userData, db);
await user.save();

// Find users
const activeUsers = await userRepo.findActiveUsers();
const admins = await userRepo.findByRole('admin');
```

#### After (SMRT)
```typescript
// SMRT usage
const users = new UserCollection({
  // Database connection handled automatically
});

// Create user (with validation)
const user = new User({
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
  role: 'user'
});

// AI-enhanced welcome message
const welcome = await user.generatePersonalizedWelcome();
console.log(welcome);

await user.save(); // Automatic validation and lifecycle hooks

// Enhanced finding with AI
const activeUsers = await users.findActiveUsers();
const searchResults = await users.searchSemantic('experienced developer');

// Analytics
const metrics = await users.getActivityMetrics();
const analysis = await users.analyzeUserBase();
```

### Step 4: Generated APIs and Tools

```typescript
// Generate REST API
import { APIGenerator } from '@have/smrt/generators';

const apiGen = new APIGenerator({
  collections: [UserCollection],
  outputDir: './api',
  includeSwagger: true,
  middleware: ['auth', 'validation', 'rateLimit']
});

await apiGen.generate();

// Generates endpoints:
// GET /api/users - List users with filtering
// GET /api/users/:id - Get specific user
// POST /api/users - Create new user
// PUT /api/users/:id - Update user
// (DELETE excluded per configuration)
```

### Migration Benefits

1. **Reduced Boilerplate**: No manual SQL queries or database connection management
2. **Built-in Validation**: Field-level validation with type safety
3. **AI Integration**: Intelligent analysis and content generation
4. **Auto-generated APIs**: REST APIs, CLI tools, and MCP servers
5. **Better Error Handling**: Comprehensive validation and lifecycle hooks
6. **Enhanced Search**: Semantic search and AI-powered filtering
7. **Analytics**: Built-in metrics and analysis capabilities
8. **Type Safety**: Improved TypeScript integration
9. **Performance**: Optimized queries and caching
10. **Scalability**: Built for production use with monitoring and logging

### Migration Checklist

- [ ] Convert properties to SMRT field definitions
- [ ] Add @smrt decorator with appropriate configuration
- [ ] Update constructor to use SMRT pattern
- [ ] Migrate database operations to SMRT methods
- [ ] Add lifecycle hooks for business logic
- [ ] Enhance with AI-powered methods
- [ ] Update collection class to extend BaseCollection
- [ ] Add validation and error handling
- [ ] Test all existing functionality
- [ ] Generate APIs and tools
- [ ] Update documentation and usage examples

This migration preserves all original functionality while adding powerful new capabilities through the SMRT framework.