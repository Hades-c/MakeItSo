import type { RosterTeacher } from "@/server/rmp/match";
import { parseRosterPage, type RosterRow } from "@/server/rmp/roster";
import { readFixtureJson } from "./helpers";

/** The synthetic roster page as the sync stores it (Davidson rows only). */
export function syntheticRosterRows(): RosterRow[] {
  return parseRosterPage(readFixtureJson("ratemyprofessors", "teachers-davidson.json")).rows;
}

export function syntheticRoster(): RosterTeacher[] {
  return syntheticRosterRows();
}
