import { SmrtCollection } from "@have/smrt";
import { EventParticipant } from "./index5.js";
class EventParticipantCollection extends SmrtCollection {
  static _itemClass = EventParticipant;
  /**
   * Get participants for an event
   *
   * @param eventId - Event ID
   * @returns Array of EventParticipant instances
   */
  async getByEvent(eventId) {
    return await this.list({ where: { eventId } });
  }
  /**
   * Get events for a participant (profile)
   *
   * @param profileId - Profile ID
   * @returns Array of EventParticipant instances
   */
  async getByProfile(profileId) {
    return await this.list({ where: { profileId } });
  }
  /**
   * Get participants by role for an event
   *
   * @param eventId - Event ID
   * @param role - Participant role
   * @returns Array of EventParticipant instances
   */
  async getByRole(eventId, role) {
    const participants = await this.getByEvent(eventId);
    return participants.filter((p) => p.role === role);
  }
  /**
   * Get participants ordered by placement
   *
   * @param eventId - Event ID
   * @returns Array of EventParticipant instances sorted by placement
   */
  async getByPlacement(eventId) {
    const participants = await this.getByEvent(eventId);
    return participants.sort((a, b) => {
      if (a.placement === null && b.placement === null) return 0;
      if (a.placement === null) return 1;
      if (b.placement === null) return -1;
      return a.placement - b.placement;
    });
  }
  /**
   * Get participants by group
   *
   * @param eventId - Event ID
   * @param groupId - Group ID
   * @returns Array of EventParticipant instances
   */
  async getByGroup(eventId, groupId) {
    const participants = await this.getByEvent(eventId);
    return participants.filter((p) => p.groupId === groupId);
  }
  /**
   * Get home participant(s) (placement = 0)
   *
   * @param eventId - Event ID
   * @returns Array of EventParticipant instances with placement 0
   */
  async getHome(eventId) {
    const participants = await this.getByEvent(eventId);
    return participants.filter((p) => p.placement === 0);
  }
  /**
   * Get away participant(s) (placement = 1)
   *
   * @param eventId - Event ID
   * @returns Array of EventParticipant instances with placement 1
   */
  async getAway(eventId) {
    const participants = await this.getByEvent(eventId);
    return participants.filter((p) => p.placement === 1);
  }
  /**
   * Search participants with filters
   *
   * @param filters - Filter criteria
   * @returns Array of matching EventParticipant instances
   */
  async search(filters) {
    let participants = await this.list({});
    if (filters.eventId) {
      participants = participants.filter((p) => p.eventId === filters.eventId);
    }
    if (filters.profileId) {
      participants = participants.filter(
        (p) => p.profileId === filters.profileId
      );
    }
    if (filters.role) {
      participants = participants.filter((p) => p.role === filters.role);
    }
    if (filters.groupId) {
      participants = participants.filter((p) => p.groupId === filters.groupId);
    }
    return participants;
  }
  /**
   * Get participant statistics for a profile
   *
   * @param profileId - Profile ID
   * @param eventTypeId - Optional event type filter
   * @returns Statistics object
   */
  async getParticipantStats(profileId, eventTypeId) {
    const participants = await this.getByProfile(profileId);
    let filteredParticipants = participants;
    if (eventTypeId) {
      filteredParticipants = [];
      for (const participant of participants) {
        const event = await participant.getEvent();
        if (event && event.typeId === eventTypeId) {
          filteredParticipants.push(participant);
        }
      }
    }
    const byRole = {};
    const byPlacement = {};
    for (const participant of filteredParticipants) {
      byRole[participant.role] = (byRole[participant.role] || 0) + 1;
      if (participant.placement !== null) {
        byPlacement[participant.placement] = (byPlacement[participant.placement] || 0) + 1;
      }
    }
    return {
      totalEvents: filteredParticipants.length,
      byRole,
      byPlacement
    };
  }
}
export {
  EventParticipantCollection
};
//# sourceMappingURL=index9.js.map
