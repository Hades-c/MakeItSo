import "server-only";

/**
 * Given-name equivalences for RateMyProfessors matching (PLAN §5 "Ratings (RMP)"). Pure.
 *
 * Each group lists the spellings of one formal name first (Katherine, Catherine, Kathryn; never a different name
 * such as Susan / Suzanne or Andrew / Andrés), then its common nicknames. Two given names are equivalent when some
 * group contains both (Chris ↔ Christopher, Bill ↔ William, Kate ↔ Katie ↔ Katherine).
 * Equivalence is never inferred from spelling: "Chris" and "Christina" share a prefix but no group, so they do not
 * match (a person who uses a nickname missing here goes into server/rmp/overrides.ts). Formal names of different
 * groups never match through a shared nickname: Christopher and Christian both contain "chris", but no group holds
 * both formal names.
 *
 * A group holds only nicknames that are rarely given names in their own right. Names that are common given names
 * on their own are left out even where they are also nicknames (Nathan, Liam, Leo, Nora, Jack, Drew, Jamie, ...:
 * STANDALONE_GIVEN_NAMES), because "Nathan Ward" and "Nathaniel Ward" are as likely two people as one. A real
 * instructor known by such a name goes into the override table.
 *
 * Names are in normalizeName() form (lower case, no accents, no punctuation).
 */

/** Common given names that are never listed as a nickname of another name (see above; tests enforce it). */
export const STANDALONE_GIVEN_NAMES: readonly string[] = [
  "ali",
  "anna",
  "bella",
  "beth",
  "carol",
  "drew",
  "eliza",
  "ellie",
  "frank",
  "gail",
  "ginger",
  "greta",
  "harry",
  "isa",
  "jack",
  "jamie",
  "jerry",
  "kay",
  "kim",
  "leo",
  "lexi",
  "lexie",
  "liam",
  "mae",
  "molly",
  "nathan",
  "nell",
  "nico",
  "nora",
  "penny",
  "polly",
  "ray",
  "sadie",
  "sally",
  "sasha",
  "terry",
  "tess",
  "tessa",
  "theo",
  "tina",
  "tori",
  "xander",
];

export const NICKNAME_GROUPS: readonly (readonly string[])[] = [
  ["abigail", "abby", "abbie"],
  ["abraham", "abe"],
  ["albert", "al", "bert"],
  ["alexander", "alex"],
  ["alexandra", "alexandria", "alex"],
  ["alfred", "al", "alf", "alfie", "fred", "freddie"],
  ["allison", "alison", "allie", "ally"],
  ["andrew", "andy"],
  ["angela", "angie"],
  ["ann", "anne", "annie", "nan"],
  ["anthony", "tony"],
  ["arthur", "art", "artie"],
  ["barbara", "barb", "barbie", "babs"],
  ["benjamin", "ben", "benji", "benny"],
  ["bradley", "brad"],
  ["cameron", "cam"],
  ["caroline", "carrie", "caro"],
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
  ],
  ["charles", "charlie", "chuck", "chas", "chip"],
  ["charlotte", "charlie", "lottie"],
  ["christopher", "kristopher", "cristopher", "chris", "kris", "kit", "topher"],
  ["christian", "chris"],
  ["christina", "kristina", "chrissy"],
  ["christine", "kristine", "chrissy"],
  ["cynthia", "cindy"],
  ["daniel", "dan", "danny"],
  ["david", "dave", "davey"],
  ["deborah", "debra", "deb", "debbie"],
  ["donald", "don", "donny"],
  ["dorothy", "dot", "dottie"],
  ["douglas", "doug"],
  ["edward", "ed", "eddie", "ted", "ned"],
  ["edwin", "ed"],
  ["eleanor", "elinor"],
  ["elizabeth", "elisabeth", "liz", "lizzie", "betsy", "betty", "libby", "liza"],
  ["emily", "em", "emmy"],
  ["eugene", "gene"],
  ["evelyn", "evie"],
  ["frances", "fran", "frankie"],
  ["francis", "fran"],
  ["frederick", "frederic", "fred", "freddie", "fritz"],
  ["gabriel", "gabe"],
  ["gabrielle", "gabriela", "gabriella", "gabby", "gabi"],
  ["gerald", "gerry"],
  ["gregory", "greg"],
  ["harold", "hal"],
  ["henry", "hank", "hal"],
  ["isabel", "isabella", "isabelle", "izzy"],
  ["jacob", "jake"],
  ["jacqueline", "jackie"],
  ["james", "jim", "jimmy"],
  ["jeffrey", "jeff"],
  ["geoffrey", "geoff", "jeff"],
  ["jennifer", "jen", "jenn", "jenny"],
  ["jessica", "jess", "jessie"],
  ["john", "johnny"],
  ["jonathan", "jon", "jonny"],
  ["joseph", "joe", "joey"],
  ["josephine", "jo", "josie"],
  ["joshua", "josh"],
  ["judith", "judy"],
  ["kenneth", "ken", "kenny"],
  ["kimberly", "kimberley"],
  ["lawrence", "laurence", "larry"],
  ["leonard", "len", "lenny"],
  ["louis", "lou"],
  ["louise", "lou"],
  ["madeline", "madeleine", "madelyn", "maddie", "maddy"],
  ["margaret", "maggie", "meg", "peggy", "marge", "margie"],
  ["martin", "marty"],
  ["matthew", "matt"],
  ["melissa", "mel", "missy"],
  ["michael", "mike", "mikey", "mick", "mickey"],
  ["mitchell", "mitch"],
  ["nathaniel", "nate", "nat"],
  ["nathan", "nate"],
  ["nicholas", "nicolas", "nick", "nicky"],
  ["nicole", "nikki", "nicky"],
  ["oliver", "ollie"],
  ["pamela", "pam"],
  ["patricia", "pat", "patty", "trish", "tricia"],
  ["patrick", "pat", "paddy"],
  ["peter", "pete"],
  ["philip", "phillip", "phil"],
  ["randall", "randy"],
  ["randolph", "randy"],
  ["rebecca", "becky", "becca"],
  ["richard", "rich", "richie", "rick", "ricky", "dick"],
  ["robert", "rob", "robbie", "bob", "bobby", "bert"],
  ["ronald", "ron", "ronnie"],
  ["russell", "russ"],
  ["samuel", "sam", "sammy"],
  ["samantha", "sam", "sammy"],
  ["sandra", "sandy"],
  ["sarah", "sara"],
  ["stephen", "steven", "steve", "stevie"],
  ["stephanie", "steph"],
  ["susan", "sue", "susie", "suzy"],
  ["suzanne", "sue", "suzy"],
  ["terence", "terrence"],
  ["teresa", "theresa"],
  ["theodore", "ted", "teddy"],
  ["thomas", "tom", "tommy"],
  ["timothy", "tim", "timmy"],
  ["valerie", "val"],
  ["victoria", "vicky", "vicki"],
  ["vincent", "vince", "vinny"],
  ["virginia", "ginny"],
  ["walter", "walt", "wally"],
  ["william", "will", "bill", "billy", "willy"],
  ["zachary", "zach", "zack"],
  ["zachariah", "zach", "zack"],
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
