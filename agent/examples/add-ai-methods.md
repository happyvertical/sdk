# Adding AI Methods to SMRT Objects

## Overview

This guide demonstrates how to add powerful AI capabilities to your SMRT objects using the built-in `do()`, `is()`, and `describe()` methods.

## Core AI Method Patterns

### 1. Using `this.do()` for Actions and Transformations

The `do()` method performs actions, generates content, and transforms data.

```typescript
class Article extends BaseObject {
  title = text({ required: true });
  content = text({ required: true });
  category = text();
  tags = json({ default: [] });

  // Content generation
  async generateSummary(): Promise<string> {
    return await this.do(`
      Create a compelling 2-3 sentence summary of this article:
      Title: ${this.title}
      Content: ${this.content.substring(0, 1000)}...

      Focus on the key takeaways and make it engaging for readers.
    `);
  }

  // Content transformation
  async improveContent(instructions: string): Promise<string> {
    const improved = await this.do(`
      Improve this article content based on these instructions:
      Instructions: ${instructions}

      Current content:
      ${this.content}

      Return the improved version maintaining the original structure and intent.
    `);

    this.content = improved;
    await this.save();
    return improved;
  }

  // SEO optimization
  async generateMetaDescription(): Promise<string> {
    return await this.do(`
      Create an SEO-optimized meta description (150-160 characters) for this article:
      Title: ${this.title}
      Content summary: ${this.content.substring(0, 500)}...

      Make it compelling and include relevant keywords.
    `);
  }

  // Tag generation
  async generateTags(): Promise<string[]> {
    const tagsString = await this.do(`
      Generate 5-8 relevant tags for this article:
      Title: ${this.title}
      Category: ${this.category}
      Content: ${this.content.substring(0, 800)}...

      Return as a comma-separated list of single-word or short-phrase tags.
    `);

    const tags = tagsString.split(',').map(tag => tag.trim());
    this.tags = tags;
    await this.save();
    return tags;
  }

  // Content enhancement
  async addCallToAction(): Promise<string> {
    return await this.do(`
      Create a compelling call-to-action for this article:
      Title: ${this.title}
      Category: ${this.category}
      Main points: ${this.content.substring(0, 300)}...

      Create 1-2 sentences that encourage reader engagement.
    `);
  }
}
```

### 2. Using `this.is()` for Validation and Assessment

The `is()` method returns boolean values for validation and assessment.

```typescript
class Product extends BaseObject {
  name = text({ required: true });
  description = text();
  price = decimal({ min: 0 });
  category = text();

  // Quality validation
  async isHighQuality(): Promise<boolean> {
    return await this.is(`
      This product meets high quality standards:
      - Has a clear, descriptive name
      - Includes detailed description (at least 100 words)
      - Price is reasonable for the category
      - All required information is present
    `);
  }

  // Market readiness
  async isMarketReady(): Promise<boolean> {
    return await this.is(`
      This product is ready for market launch:
      - Product information is complete and accurate
      - Pricing is competitive for the category
      - Description clearly communicates value proposition
      - All legal and compliance requirements appear met
    `);
  }

  // SEO optimization check
  async isSEOOptimized(): Promise<boolean> {
    return await this.is(`
      This product listing is optimized for search:
      - Title includes relevant keywords
      - Description is detailed and keyword-rich
      - Category is appropriate and specific
      - Content would rank well in search results
    `);
  }

  // Pricing validation
  async isPriceCompetitive(): Promise<boolean> {
    return await this.is(`
      This product's price is competitive:
      Product: ${this.name}
      Price: $${this.price}
      Category: ${this.category}
      Features: ${this.description}

      Consider typical market rates for similar products.
    `);
  }

  // Content completeness
  async hasCompleteInformation(): Promise<boolean> {
    return await this.is(`
      This product has all necessary information for customers:
      - Clear product name
      - Detailed description
      - Appropriate pricing
      - Proper categorization
      - Sufficient detail to make purchase decisions
    `);
  }
}
```

### 3. Using `this.describe()` for Insights and Analysis

The `describe()` method generates descriptive analysis and insights.

```typescript
class UserProfile extends BaseObject {
  name = text({ required: true });
  email = text({ required: true });
  role = text();
  joinDate = datetime();
  activityLevel = text();
  preferences = json({ default: {} });

  // User analysis
  async describeUserProfile(): Promise<string> {
    return await this.describe(`
      Analyze this user profile and provide insights:
      Name: ${this.name}
      Role: ${this.role}
      Join Date: ${this.joinDate}
      Activity Level: ${this.activityLevel}
      Preferences: ${JSON.stringify(this.preferences)}

      Focus on user engagement patterns, preferences, and recommendations.
    `);
  }

  // Engagement insights
  async describeEngagementLevel(): Promise<string> {
    return await this.describe(`
      Analyze this user's engagement level:
      Activity Level: ${this.activityLevel}
      Join Date: ${this.joinDate}
      Role: ${this.role}

      Provide insights on engagement patterns and suggestions for improvement.
    `);
  }

  // Personalization recommendations
  async describePersonalizationOpportunities(): Promise<string> {
    return await this.describe(`
      Identify personalization opportunities for this user:
      Preferences: ${JSON.stringify(this.preferences)}
      Role: ${this.role}
      Activity: ${this.activityLevel}

      Suggest specific ways to customize their experience.
    `);
  }
}
```

## Advanced AI Method Patterns

### 1. Conditional AI Processing

```typescript
class Document extends BaseObject {
  content = text();
  type = text(); // article, report, memo, etc.
  language = text({ default: 'en' });

  async processContent(): Promise<string> {
    // Different processing based on document type
    if (this.type === 'article') {
      return await this.do(`
        Optimize this article for readability and engagement:
        ${this.content}

        Improve flow, clarity, and reader engagement.
      `);
    } else if (this.type === 'report') {
      return await this.do(`
        Structure this report for executive consumption:
        ${this.content}

        Add executive summary, clear sections, and key insights.
      `);
    } else {
      return await this.do(`
        Improve the clarity and professionalism of this document:
        ${this.content}
      `);
    }
  }

  async isAppropriateLength(): Promise<boolean> {
    const criteria = this.type === 'memo' ?
      'This memo is concise (under 500 words) but complete' :
      this.type === 'article' ?
      'This article is comprehensive (800+ words) and detailed' :
      'This document is appropriate length for its purpose';

    return await this.is(criteria);
  }
}
```

### 2. Multi-Step AI Workflows

```typescript
class Product extends BaseObject {
  name = text();
  features = json({ default: [] });
  targetAudience = text();

  async optimizeForMarketing(): Promise<void> {
    // Step 1: Analyze target audience
    const audienceInsights = await this.describe(`
      Analyze the target audience for this product:
      Product: ${this.name}
      Target Audience: ${this.targetAudience}
      Features: ${JSON.stringify(this.features)}

      Provide insights on demographics, needs, and motivations.
    `);

    // Step 2: Generate marketing angles
    const marketingAngles = await this.do(`
      Based on this audience analysis, suggest 3-5 marketing angles:
      ${audienceInsights}

      Focus on benefits that resonate with the target audience.
    `);

    // Step 3: Optimize product name
    const optimizedName = await this.do(`
      Optimize this product name for the target audience:
      Current name: ${this.name}
      Target audience: ${this.targetAudience}
      Marketing angles: ${marketingAngles}

      Create a name that appeals to the audience and conveys key benefits.
    `);

    // Step 4: Validate optimization
    const isEffective = await this.is(`
      This optimized product name is effective for marketing:
      Name: ${optimizedName}
      Target audience: ${this.targetAudience}
      Key benefits: ${marketingAngles}

      The name should be memorable, benefit-focused, and audience-appropriate.
    `);

    if (isEffective) {
      this.name = optimizedName;
      await this.save();
    }
  }
}
```

### 3. Context-Aware AI Methods

```typescript
class SupportTicket extends BaseObject {
  subject = text();
  description = text();
  priority = text();
  customerType = text(); // free, premium, enterprise
  category = text();

  async suggestResponse(): Promise<string> {
    const context = this.buildContextString();

    return await this.do(`
      Suggest a helpful response to this support ticket:
      ${context}

      Response should be:
      - Professional and empathetic
      - Specific to the customer type (${this.customerType})
      - Actionable and solution-focused
      - Appropriate for the priority level (${this.priority})
    `);
  }

  async estimatePriority(): Promise<string> {
    return await this.do(`
      Estimate the priority level for this support ticket:
      Subject: ${this.subject}
      Description: ${this.description}
      Customer Type: ${this.customerType}

      Return one of: low, medium, high, urgent
      Consider impact on customer and business.
    `);
  }

  async requiresEscalation(): Promise<boolean> {
    return await this.is(`
      This support ticket requires escalation to senior support:
      Subject: ${this.subject}
      Description: ${this.description}
      Customer Type: ${this.customerType}
      Priority: ${this.priority}

      Consider complexity, customer importance, and potential impact.
    `);
  }

  private buildContextString(): string {
    return `
      Subject: ${this.subject}
      Description: ${this.description}
      Priority: ${this.priority}
      Customer Type: ${this.customerType}
      Category: ${this.category}
      Created: ${this.created_at}
    `;
  }
}
```

### 4. Error Handling and Fallbacks

```typescript
class Article extends BaseObject {
  content = text();

  async analyzeReadability(): Promise<number> {
    try {
      const score = await this.do(`
        Analyze the readability of this content and provide a score from 1-10:
        ${this.content.substring(0, 1000)}...

        Consider sentence structure, vocabulary, and clarity.
        Respond with only the number.
      `);

      const numericScore = parseFloat(score);
      return isNaN(numericScore) ? 5 : Math.max(1, Math.min(10, numericScore));

    } catch (error) {
      console.warn('AI readability analysis failed:', error);
      return 5; // Default neutral score
    }
  }

  async generateSummary(): Promise<string> {
    try {
      return await this.do(`
        Create a brief summary of this article:
        ${this.content.substring(0, 800)}...

        Limit to 2-3 sentences highlighting key points.
      `);
    } catch (error) {
      console.warn('AI summary generation failed:', error);

      // Fallback: Use first paragraph
      const firstParagraph = this.content.split('\n')[0];
      return firstParagraph.substring(0, 200) + '...';
    }
  }

  async isComplete(): Promise<boolean> {
    try {
      return await this.is(`
        This article appears complete and ready for publication:
        - Has substantial content (500+ words)
        - Covers the topic thoroughly
        - Has clear beginning, middle, and end
      `);
    } catch (error) {
      console.warn('AI completeness check failed:', error);

      // Fallback: Basic length check
      return this.content.length > 500;
    }
  }
}
```

### 5. Performance Optimization with Caching

```typescript
class Product extends BaseObject {
  private static aiCache = new Map<string, any>();
  private static readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  async getOptimizedDescription(): Promise<string> {
    const cacheKey = `desc_${this.id}_${this.updated_at?.getTime()}`;
    const cached = Product.aiCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < Product.CACHE_TTL) {
      return cached.value;
    }

    const optimized = await this.do(`
      Create an optimized product description:
      Name: ${this.name}
      Current description: ${this.description}

      Make it more compelling and SEO-friendly.
    `);

    Product.aiCache.set(cacheKey, {
      value: optimized,
      timestamp: Date.now()
    });

    return optimized;
  }

  // Batch processing for multiple products
  static async batchAnalyze(products: Product[]): Promise<string[]> {
    const batchSize = 5;
    const results: string[] = [];

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(product => product.analyzeCompetitiveness())
      );

      results.push(...batchResults);

      // Small delay to respect rate limits
      if (i + batchSize < products.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}
```

## Best Practices for AI Methods

### 1. Clear and Specific Prompts
```typescript
// Good: Specific, actionable prompt
async validateBusinessData(): Promise<boolean> {
  return await this.is(`
    This business data is complete and accurate:
    - Company name is professional and appropriate
    - Contact information is valid and formatted correctly
    - Business category matches the actual business type
    - All required regulatory fields are completed
  `);
}

// Avoid: Vague, ambiguous prompt
async isGood(): Promise<boolean> {
  return await this.is('This data is good');
}
```

### 2. Include Relevant Context
```typescript
async generateMarketingCopy(): Promise<string> {
  return await this.do(`
    Create marketing copy for this product:

    Product: ${this.name}
    Category: ${this.category}
    Price: $${this.price}
    Key Features: ${this.features.join(', ')}
    Target Audience: ${this.targetAudience}
    Unique Selling Points: ${this.uniqueFeatures}

    Style: Professional yet approachable
    Length: 2-3 paragraphs
    Goal: Drive conversions and highlight value
  `);
}
```

### 3. Handle Edge Cases
```typescript
async categorizeContent(): Promise<string> {
  if (!this.content || this.content.trim().length < 50) {
    return 'insufficient-content';
  }

  try {
    const category = await this.do(`
      Categorize this content into one of these categories:
      - news, tutorial, review, opinion, analysis, reference

      Content: ${this.content.substring(0, 500)}...

      Respond with only the category name.
    `);

    const validCategories = ['news', 'tutorial', 'review', 'opinion', 'analysis', 'reference'];
    return validCategories.includes(category.toLowerCase()) ?
           category.toLowerCase() : 'uncategorized';

  } catch (error) {
    return 'categorization-failed';
  }
}
```

This comprehensive guide shows how to effectively integrate AI capabilities into your SMRT objects, making them intelligent, adaptive, and highly functional.