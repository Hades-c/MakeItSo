import "server-only";

/**
 * Given-name equivalences for RateMyProfessors matching (PLAN §5 "Ratings (RMP)"). Pure.
 *
 * Each group lists the spellings of one formal name first, then its common nicknames. Two given names are
 * equivalent when some group contains both (Chris ↔ Christopher, Bill ↔ William, Kate ↔ Katie ↔ Katherine).
 * Equivalence is never inferred from spelling: "Chris" and "Christina" share a prefix but no group, so they do not
 * match (a person who uses a nickname missing here goes into server/rmp/overrides.ts). Formal names of different
 * groups never match through a shared nickname: Christopher and Christian both contain "chris", but no group holds
 * both formal names.
 *
 * Names are in normalizeName() form (lower case, no accents, no punctuation).
 */
export const NICKNAME_GROUPS: readonly (readonly string[])[] = [
  ["abigail", "abby", "abbie", "gail"],
  ["abraham", "abe"],
  ["albert", "al", "bert"],
  ["alexander", "alexandre", "alejandro", "alex", "xander", "sasha"],
  ["alexandra", "alexandria", "alex", "lexi", "lexie", "sasha"],
  ["alfred", "al", "alf", "alfie", "fred", "freddie"],
  ["allison", "alison", "allie", "ally", "ali"],
  ["andrew", "andreas", "andres", "andy", "drew"],
  ["angela", "angie"],
  ["ann", "anne", "anna", "annie", "nan"],
  ["anthony", "antonio", "tony"],
  ["arthur", "art", "artie"],
  ["barbara", "barb", "barbie", "babs"],
  ["benjamin", "ben", "benji", "benny"],
  ["bradley", "brad"],
  ["cameron", "cam"],
  ["caroline", "carolyn", "carol", "carrie", "caro"],
  [
    "katherine",
    "catherine",
    "kathryn",
    "katharine",
    "catharine",
    "kathrine",
    "kate",
    "katie",
    "katy",
    "kathy",
    "cathy",
    "kat",
    "kitty",
    "kay",
  ],
  ["charles", "charlie", "chuck", "chas", "chip"],
  ["charlotte", "charlie", "lottie"],
  ["christopher", "kristopher", "cristopher", "chris", "kris", "kit", "topher"],
  ["christian", "chris"],
  ["christina", "christine", "kristina", "kristine", "tina", "chrissy"],
  ["cynthia", "cindy"],
  ["daniel", "dan", "danny"],
  ["david", "dave", "davey"],
  ["deborah", "debra", "deb", "debbie"],
  ["donald", "don", "donny"],
  ["dorothy", "dot", "dottie"],
  ["douglas", "doug"],
  ["edward", "ed", "eddie", "ted", "ned"],
  ["edwin", "ed"],
  ["eleanor", "elinor", "ellie", "nell", "nora"],
  [
    "elizabeth",
    "elisabeth",
    "liz",
    "lizzie",
    "beth",
    "betsy",
    "betty",
    "eliza",
    "libby",
    "liza",
    "ellie",
  ],
  ["emily", "em", "emmy"],
  ["eugene", "gene"],
  ["evelyn", "evie"],
  ["frances", "fran", "frankie"],
  ["francis", "frank", "fran"],
  ["frederick", "frederic", "fred", "freddie", "fritz"],
  ["gabriel", "gabe"],
  ["gabrielle", "gabriela", "gabriella", "gabby", "gabi"],
  ["gerald", "gerry", "jerry"],
  ["gregory", "greg"],
  ["harold", "hal", "harry"],
  ["henry", "hank", "harry", "hal"],
  ["isabel", "isabella", "isabelle", "izzy", "bella", "isa"],
  ["jacob", "jake"],
  ["jacqueline", "jackie"],
  ["james", "jim", "jimmy", "jamie"],
  ["jeffrey", "geoffrey", "jeff", "geoff"],
  ["jennifer", "jen", "jenn", "jenny"],
  ["jessica", "jess", "jessie"],
  ["john", "jack", "johnny"],
  ["jonathan", "jon", "jonny"],
  ["joseph", "joe", "joey"],
  ["josephine", "jo", "josie"],
  ["joshua", "josh"],
  ["judith", "judy"],
  ["kenneth", "ken", "kenny"],
  ["kimberly", "kimberley", "kim"],
  ["lawrence", "laurence", "larry"],
  ["leonard", "len", "lenny", "leo"],
  ["louis", "lou"],
  ["louise", "lou"],
  ["madeline", "madeleine", "madelyn", "maddie", "maddy"],
  ["margaret", "maggie", "meg", "peggy", "marge", "margie", "greta"],
  ["martin", "marty"],
  ["mary", "molly", "polly", "mae"],
  ["matthew", "matt"],
  ["melissa", "mel", "missy"],
  ["michael", "mike", "mikey", "mick", "mickey"],
  ["mitchell", "mitch"],
  ["nathaniel", "nathan", "nate", "nat"],
  ["nicholas", "nicolas", "nick", "nicky", "nico"],
  ["nicole", "nikki", "nicky"],
  ["oliver", "ollie"],
  ["pamela", "pam"],
  ["patricia", "pat", "patty", "trish", "tricia"],
  ["patrick", "pat", "paddy"],
  ["penelope", "penny"],
  ["peter", "pete"],
  ["philip", "phillip", "phil"],
  ["randall", "randolph", "randy"],
  ["raymond", "ray"],
  ["rebecca", "becky", "becca"],
  ["richard", "rich", "richie", "rick", "ricky", "dick"],
  ["robert", "rob", "robbie", "bob", "bobby", "bert"],
  ["ronald", "ron", "ronnie"],
  ["russell", "russ"],
  ["samuel", "sam", "sammy"],
  ["samantha", "sam", "sammy"],
  ["sandra", "sandy"],
  ["sarah", "sara", "sally", "sadie"],
  ["stephen", "steven", "steve", "stevie"],
  ["stephanie", "steph"],
  ["susan", "suzanne", "sue", "susie", "suzy"],
  ["terence", "terrence", "terry"],
  ["teresa", "theresa", "terry", "tess", "tessa"],
  ["theodore", "ted", "teddy", "theo"],
  ["thomas", "tom", "tommy"],
  ["timothy", "tim", "timmy"],
  ["valerie", "val"],
  ["victoria", "vicky", "vicki", "tori"],
  ["vincent", "vince", "vinny"],
  ["virginia", "ginny", "ginger"],
  ["walter", "walt", "wally"],
  ["william", "will", "bill", "billy", "willy", "liam"],
  ["zachary", "zachariah", "zach", "zack"],
];

const GROUPS_BY_NAME: ReadonlyMap<string, ReadonlySet<number>> = (() => {
  const map = new Map<string, Set<number>>();
  NICKNAME_GROUPS.forEach((group, index) => {
    for (const name of group) {
      let groups = map.get(name);
      if (!groups) map.set(name, (groups = new Set()));
      groups.add(index);
    }
  });
  return map;
})();

/** True when two different given names (normalizeName form) are listed in one nickname group. */
export function areNicknames(a: string, b: string): boolean {
  if (a === b) return false;
  const groupsA = GROUPS_BY_NAME.get(a);
  const groupsB = GROUPS_BY_NAME.get(b);
  if (!groupsA || !groupsB) return false;
  for (const group of groupsA) if (groupsB.has(group)) return true;
  return false;
}
