import { SmrtCollection } from "@have/smrt";
import { EventSeries } from "./index3.js";
class EventSeriesCollection extends SmrtCollection {
  static _itemClass = EventSeries;
  /**
   * Get series by organizer
   *
   * @param organizerId - Profile ID of the organizer
   * @returns Array of EventSeries instances
   */
  async getByOrganizer(organizerId) {
    return await this.list({ where: { organizerId } });
  }
  /**
   * Get currently active series
   *
   * @returns Array of EventSeries instances active today
   */
  async getActive() {
    const allSeries = await this.list({});
    const now = /* @__PURE__ */ new Date();
    return allSeries.filter((series) => {
      if (series.startDate && now < series.startDate) return false;
      if (series.endDate && now > series.endDate) return false;
      return true;
    });
  }
  /**
   * Get upcoming series
   *
   * @param limit - Maximum number of series to return
   * @returns Array of EventSeries instances starting in the future
   */
  async getUpcoming(limit) {
    const allSeries = await this.list({});
    const now = /* @__PURE__ */ new Date();
    const upcoming = allSeries.filter((series) => series.startDate && series.startDate > now).sort((a, b) => {
      if (!a.startDate || !b.startDate) return 0;
      return a.startDate.getTime() - b.startDate.getTime();
    });
    return limit ? upcoming.slice(0, limit) : upcoming;
  }
  /**
   * Get series by type
   *
   * @param typeId - EventType ID
   * @returns Array of EventSeries instances
   */
  async getByType(typeId) {
    return await this.list({ where: { typeId } });
  }
  /**
   * Search series with filters
   *
   * @param query - Search query for name/description
   * @param filters - Additional filter criteria
   * @returns Array of matching EventSeries instances
   */
  async search(query, filters) {
    let series = await this.list({});
    if (query) {
      const lowerQuery = query.toLowerCase();
      series = series.filter(
        (s) => s.name?.toLowerCase().includes(lowerQuery) || s.description?.toLowerCase().includes(lowerQuery)
      );
    }
    if (filters) {
      if (filters.typeId) {
        series = series.filter((s) => s.typeId === filters.typeId);
      }
      if (filters.organizerId) {
        series = series.filter((s) => s.organizerId === filters.organizerId);
      }
      if (filters.startDate) {
        series = series.filter(
          (s) => s.startDate && s.startDate >= filters.startDate
        );
      }
      if (filters.endDate) {
        series = series.filter(
          (s) => s.endDate && s.endDate <= filters.endDate
        );
      }
    }
    return series;
  }
}
export {
  EventSeriesCollection
};
//# sourceMappingURL=index7.js.map
