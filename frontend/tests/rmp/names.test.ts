import { describe, expect, it } from "vitest";
import { matchGivenNames, matchName, matchSurnames } from "@/server/rmp/match";
import { areNicknames, NICKNAME_GROUPS } from "@/server/rmp/nicknames";
import { nameTokens, normalizeName, surnameTokens } from "@/server/rmp/normalize";

const given = (a: string, b: string) => matchGivenNames(nameTokens(a), nameTokens(b));
const surname = (a: string, b: string) => matchSurnames(surnameTokens(a), surnameTokens(b));

describe("nickname table", () => {
  it.each([
    ["chris", "christopher"],
    ["bill", "william"],
    ["will", "william"],
    ["kate", "katherine"],
    ["katie", "katherine"],
    ["kate", "katie"],
    ["katie", "catherine"],
    ["josh", "joshua"],
    ["tim", "timothy"],
    ["jake", "jacob"],
    ["tori", "victoria"],
    ["sally", "sarah"],
    ["drew", "andrew"],
    ["fred", "frederick"],
    ["fred", "alfred"],
  ])("%s ↔ %s", (a, b) => {
    expect(areNicknames(a, b)).toBe(true);
    expect(areNicknames(b, a)).toBe(true);
  });

  it.each([
    ["chris", "christina"],
    ["chris", "christine"],
    ["christopher", "christian"],
    ["alexander", "alexandra"],
    ["frederick", "alfred"],
    ["samuel", "samantha"],
    ["joshua", "jacob"],
    ["lenny", "lengxob"],
    ["tim", "tim"],
  ])("never %s ↔ %s", (a, b) => {
    expect(areNicknames(a, b)).toBe(false);
  });

  it("is written in normalizeName form, without duplicates inside a group", () => {
    for (const group of NICKNAME_GROUPS) {
      expect(group.length).toBeGreaterThanOrEqual(2);
      for (const name of group) expect(normalizeName(name)).toBe(name);
      expect(new Set(group).size).toBe(group.length);
    }
  });
});

describe("given-name matching (never prefix-only)", () => {
  it("exact, including spacing and hyphen variants", () => {
    expect(given("Onita", "Onita")).toBe("exact");
    expect(given("Alesha ", "alesha")).toBe("exact");
    expect(given("Mary-Beth", "Marybeth")).toBe("exact");
    expect(given("Jia Yi", "Jia-Yi")).toBe("exact");
  });

  it("nickname pairs from the table", () => {
    expect(given("Chris", "Christopher")).toBe("nickname");
    expect(given("Bill", "William")).toBe("nickname");
    expect(given("Kate", "Katherine")).toBe("nickname");
    expect(given("Katie", "Katherine")).toBe("nickname");
    expect(given("Josh", "Joshua")).toBe("nickname");
    expect(given("Tim", "Timothy")).toBe("nickname");
    expect(given("Tim J.", "Timothy")).toBe("nickname");
  });

  it("a leading given name with or without a middle name or initial", () => {
    expect(given("Jia Yi", "Jia")).toBe("partial");
    expect(given("Mary K.", "Mary")).toBe("partial");
    expect(given("J. Michael", "Michael")).toBe("partial");
  });

  it("an initial against a full name", () => {
    expect(given("C.", "Christopher")).toBe("initial");
    expect(given("Christopher", "C")).toBe("initial");
    expect(given("J R", "John")).toBe("initial");
  });

  it("rejects prefixes, different names and contradicting middle names", () => {
    expect(given("Chris", "Christina")).toBeNull();
    expect(given("Christina", "Chris")).toBeNull();
    expect(given("Tim", "Timo")).toBeNull();
    expect(given("Dan", "Danielle")).toBeNull();
    expect(given("Joshua", "Jacob")).toBeNull();
    expect(given("Hilary", "Sharon")).toBeNull();
    expect(given("Mary Ann", "Mary Beth")).toBeNull();
    expect(given("Mary K", "Mary L")).toBeNull();
    expect(given("C.", "Daniel")).toBeNull();
    expect(given("", "Daniel")).toBeNull();
  });
});

describe("surname matching", () => {
  it("exact after normalisation (trailing spaces, apostrophes, periods, one-word forms)", () => {
    expect(surname("Bond", "Bond ")).toBe("exact");
    expect(surname("O'Geen", "O''Geen")).toBe("exact");
    expect(surname("St Clair", "St. Clair")).toBe("exact");
    expect(surname("St Clair", "StClair")).toBe("exact");
    expect(surname("Vaz-Hooper", "Vaz Hooper")).toBe("exact");
    expect(surname("El Bejjani", "El-Bejjani")).toBe("exact");
    expect(surname("Smith Jr.", "Smith")).toBe("exact");
  });

  it("token subset: Vaz ↔ Vaz-Hooper, Keith ↔ Villa Keith, Clair ↔ St Clair", () => {
    expect(surname("Vaz", "Vaz-Hooper")).toBe("subset");
    expect(surname("Vaz-Hooper", "Vaz")).toBe("subset");
    expect(surname("Keith", "Villa Keith")).toBe("subset");
    expect(surname("Bejjani", "El Bejjani")).toBe("subset");
    expect(surname("Clair", "St Clair")).toBe("subset");
    expect(surname("Gouri Suresh", "Suresh Gouri")).toBe("subset");
  });

  it("never Sainte-Claire for St Clair, never through a particle alone, never a different surname", () => {
    expect(surname("St Clair", "Sainte-Claire")).toBeNull();
    expect(surname("St. Clair", "Sainte Claire")).toBeNull();
    expect(surname("El", "El Bejjani")).toBeNull();
    expect(surname("St", "St Clair")).toBeNull();
    expect(surname("El Bejjani", "El Amin")).toBeNull();
    expect(surname("Green", "Greene")).toBeNull();
    expect(surname("Lee", "Leeanna")).toBeNull();
    expect(surname("Smith", "")).toBeNull();
  });
});

describe("matchName: the surname AND the given name must match", () => {
  const rmp = (firstName: string, lastName: string) => ({ firstName, lastName });

  it("grades direct matches", () => {
    expect(matchName({ first: "Fred", last: "Smith" }, rmp("Fred", "Smith"))?.strength).toBe(
      "strong",
    );
    expect(matchName({ first: "Tim", last: "Chartier" }, rmp("Timothy", "Chartier"))).toEqual({
      kind: { form: "direct", given: "nickname", surname: "exact" },
      strength: "medium",
    });
    expect(matchName({ first: "Onita", last: "Vaz" }, rmp("Onita", "Vaz-Hooper"))).toEqual({
      kind: { form: "direct", given: "exact", surname: "subset" },
      strength: "medium",
    });
    expect(matchName({ first: "K.", last: "Hales" }, rmp("Karen", "Hales"))?.strength).toBe("weak");
    expect(
      matchName({ first: "Kate", last: "Clair" }, rmp("Katherine", "St Clair"))?.strength,
    ).toBe("weak");
  });

  it("never matches on the surname alone", () => {
    expect(matchName({ first: "Hilary", last: "Green" }, rmp("Sharon", "Green"))).toBeNull();
    expect(matchName({ first: "Sally", last: "Bullock" }, rmp("Graham", "Bullock"))).toBeNull();
    expect(matchName({ first: "Tori", last: "Lee" }, rmp("Hugh", "Lee"))).toBeNull();
    expect(matchName({ first: "Jacob", last: "Smith" }, rmp("Josh", "Smith"))).toBeNull();
    expect(matchName({ first: "Linsey", last: "St Clair" }, rmp("Katie", "St Clair"))).toBeNull();
  });

  it("first/last swap: exchanged names, and a compound surname stored as RMP first + last", () => {
    expect(matchName({ first: "Wei", last: "Zhang" }, rmp("Zhang", "Wei"))).toEqual({
      kind: { form: "swap" },
      strength: "medium",
    });
    expect(matchName({ first: "Shyam", last: "Gouri Suresh" }, rmp("Suresh", "Gouri"))).toEqual({
      kind: { form: "compound-surname" },
      strength: "medium",
    });
    expect(matchName({ first: "Shyam", last: "Gouri Suresh" }, rmp("Gouri", "Suresh"))).toEqual({
      kind: { form: "compound-surname" },
      strength: "medium",
    });
    // A two-token surname whose second token is a particle is not a compound: "El" + "Bejjani" is surname-only.
    expect(matchName({ first: "Rachid", last: "El Bejjani" }, rmp("El", "Bejjani"))).toBeNull();
    // A one-token surname never swaps with a different given name.
    expect(matchName({ first: "Wei", last: "Zhang" }, rmp("Zhang", "Li"))).toBeNull();
  });
});
