import { SmrtCollection } from "@have/smrt";
import { EventType } from "./index2.js";
class EventTypeCollection extends SmrtCollection {
  static _itemClass = EventType;
  /**
   * Get or create an event type by slug
   *
   * @param slug - EventType slug (e.g., 'basketball-game', 'concert')
   * @param name - Optional display name (defaults to capitalized slug)
   * @returns EventType instance
   */
  async getOrCreate(slug, name) {
    const existing = await this.get({ slug });
    if (existing) {
      return existing;
    }
    const displayName = name || slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    return await this.create({
      slug,
      name: displayName
    });
  }
  /**
   * Get an event type by slug
   *
   * @param slug - EventType slug to search for
   * @returns EventType instance or null if not found
   */
  async getBySlug(slug) {
    return await this.get({ slug });
  }
  /**
   * Initialize default event types
   *
   * Creates common event types if they don't exist:
   * - Sports: game, period, goal, assist, penalty
   * - Entertainment: concert, performance, song
   * - Professional: conference, session, presentation, workshop
   * - Community: meeting, agenda-item, motion, vote
   *
   * @returns Array of created/existing event types
   */
  async initializeDefaults() {
    const defaults = [
      // Sports
      { slug: "game", name: "Game" },
      { slug: "match", name: "Match" },
      { slug: "period", name: "Period" },
      { slug: "quarter", name: "Quarter" },
      { slug: "inning", name: "Inning" },
      { slug: "goal", name: "Goal" },
      { slug: "assist", name: "Assist" },
      { slug: "penalty", name: "Penalty" },
      { slug: "substitution", name: "Substitution" },
      // Entertainment
      { slug: "concert", name: "Concert" },
      { slug: "performance", name: "Performance" },
      { slug: "set", name: "Set" },
      { slug: "song", name: "Song" },
      { slug: "theater", name: "Theater" },
      { slug: "show", name: "Show" },
      // Professional
      { slug: "conference", name: "Conference" },
      { slug: "session", name: "Session" },
      { slug: "presentation", name: "Presentation" },
      { slug: "workshop", name: "Workshop" },
      { slug: "seminar", name: "Seminar" },
      { slug: "keynote", name: "Keynote" },
      { slug: "panel", name: "Panel" },
      // Community
      { slug: "meeting", name: "Meeting" },
      { slug: "town-hall", name: "Town Hall" },
      { slug: "agenda-item", name: "Agenda Item" },
      { slug: "motion", name: "Motion" },
      { slug: "amendment", name: "Amendment" },
      { slug: "vote", name: "Vote" },
      { slug: "discussion", name: "Discussion" },
      // General
      { slug: "event", name: "Event" },
      { slug: "activity", name: "Activity" },
      { slug: "action", name: "Action" }
    ];
    const types = [];
    for (const def of defaults) {
      const type = await this.getOrCreate(def.slug, def.name);
      types.push(type);
    }
    return types;
  }
}
export {
  EventTypeCollection
};
//# sourceMappingURL=index6.js.map
