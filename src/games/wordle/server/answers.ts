// Words that can be the daily answer: common, family-friendly, and a few froyo
// favorites. Guesses are checked against the much larger allowed-guesses.json.
// Adding or removing a word reshuffles the schedule (see schedule.ts), so make
// edits between promotions, not during one.
export const ANSWERS: readonly string[] = [
  // froyo counter
  'MANGO', 'BERRY', 'PEACH', 'LEMON', 'MELON', 'GRAPE', 'APPLE', 'CREAM', 'SWEET', 'SUGAR',
  'CANDY', 'COCOA', 'FUDGE', 'TWIST', 'SCOOP', 'FRUIT', 'GUAVA', 'HONEY', 'WAFER', 'SWIRL',
  'SAUCE', 'SYRUP', 'TREAT', 'FROST', 'CHILL', 'FRESH', 'JUICE', 'TASTE', 'SPOON',
  // food and drink
  'BREAD', 'TOAST', 'PIZZA', 'PASTA', 'SALAD', 'STEAK', 'ONION', 'OLIVE', 'SPICE', 'CURRY',
  'BACON', 'BAGEL', 'DONUT', 'CRISP', 'CRUMB', 'FEAST', 'LUNCH', 'SNACK', 'DINER', 'GRILL',
  'ROAST', 'BLEND', 'SHAKE', 'CHEWY',
  // nature
  'OCEAN', 'RIVER', 'BEACH', 'CLOUD', 'STORM', 'SUNNY', 'RAINY', 'WINDY', 'SHORE', 'CORAL',
  'FIELD', 'GRASS', 'LEAFY', 'PLANT', 'BLOOM', 'PETAL', 'TULIP', 'DAISY', 'LILAC', 'STONE',
  'CLIFF', 'TRAIL', 'NORTH', 'SOUTH', 'EARTH', 'WORLD', 'LIGHT', 'NIGHT', 'SHADE', 'WATER',
  'FLAME', 'SPARK', 'CREEK',
  // animals
  'TIGER', 'ZEBRA', 'HORSE', 'SHEEP', 'SNAKE', 'WHALE', 'SHARK', 'OTTER', 'PANDA', 'KOALA',
  'EAGLE', 'ROBIN', 'CRANE', 'GOOSE', 'MOUSE', 'BUNNY', 'PUPPY', 'KITTY', 'CAMEL', 'LLAMA',
  'BISON', 'MOOSE', 'SKUNK', 'TROUT', 'FINCH', 'HERON', 'STORK',
  // home and things
  'CHAIR', 'TABLE', 'COUCH', 'CLOCK', 'PHONE', 'RADIO', 'PIANO', 'FLUTE', 'BRUSH', 'PAINT',
  'PAPER', 'SHELF', 'FRAME', 'HOUSE', 'FLOOR', 'FENCE', 'PORCH', 'TOWER', 'BRICK', 'TRAIN',
  'PLANE', 'TRUCK', 'WAGON', 'WHEEL', 'SHIRT', 'DRESS', 'SKIRT', 'JEANS', 'SCARF', 'GLOVE',
  'WATCH', 'CROWN',
  // people and places
  'GUEST', 'CHILD', 'ADULT', 'COACH', 'NURSE', 'CHIEF', 'ACTOR', 'SMILE', 'LAUGH', 'CHEER',
  'HAPPY', 'PROUD', 'BRAVE', 'CLEAR', 'MERRY', 'PARTY', 'DANCE', 'MUSIC', 'STORY', 'MOVIE',
  'SPORT', 'MEDAL', 'PRIZE', 'PLAZA', 'STORE', 'HOTEL', 'CLASS',
  // everyday words
  'ABOUT', 'ABOVE', 'AFTER', 'AGAIN', 'AGREE', 'AHEAD', 'ALIKE', 'ALIVE', 'ALLOW', 'ALONE',
  'ALONG', 'AMONG', 'ANGLE', 'ANKLE', 'ARGUE', 'ARISE', 'ASIDE', 'AWARD', 'AWAKE', 'BASIC',
  'BEGIN', 'BEING', 'BELOW', 'BENCH', 'BLACK', 'BLOCK', 'BOARD', 'BOOST', 'BOUND', 'BRAIN',
  'BRAND', 'BREAK', 'BRIEF', 'BRING', 'BROAD', 'BROWN', 'BUILD', 'BUNCH', 'CARRY', 'CATCH',
  'CAUSE', 'CHAIN', 'CHARM', 'CHART', 'CHASE', 'CHEAP', 'CHECK', 'CIVIC', 'CLAIM', 'CLEAN',
  'CLIMB', 'CLOSE', 'COAST', 'COLOR', 'COUNT', 'COURT', 'COVER', 'CRAFT', 'CROSS', 'CROWD',
  'CURVE', 'CYCLE', 'DAILY', 'DEPTH', 'DOUBT', 'DRAFT', 'DRAMA', 'DREAM', 'DRINK', 'DRIVE',
  'EARLY', 'EIGHT', 'EMPTY', 'ENJOY', 'ENTER', 'EQUAL', 'ERROR', 'EVENT', 'EVERY', 'EXACT',
  'EXTRA', 'FAITH', 'FANCY', 'FAVOR', 'FEVER', 'FIFTY', 'FINAL', 'FIRST', 'FLASH', 'FLOAT',
  'FOCUS', 'FORCE', 'FORTH', 'FOUND', 'FRONT', 'FUNNY', 'GIANT', 'GIVEN', 'GLASS', 'GLOBE',
  'GRACE', 'GRADE', 'GRAND', 'GRANT', 'GREAT', 'GREEN', 'GROUP', 'GROWN', 'GUARD', 'GUESS',
  'GUIDE', 'HEART', 'HEAVY', 'HELLO', 'HOBBY', 'HONOR', 'HUMAN', 'IDEAL', 'IMAGE', 'INNER',
  'ISSUE', 'JUDGE', 'KNOWN', 'LABEL', 'LARGE', 'LATER', 'LAYER', 'LEARN', 'LEAST', 'LEAVE',
  'LEVEL', 'LOCAL', 'LOGIC', 'LOOSE', 'LOWER', 'LUCKY', 'MAGIC', 'MAJOR', 'MAKER', 'MARCH',
  'MATCH', 'MAYBE', 'METAL', 'MIGHT', 'MINOR', 'MODEL', 'MONEY', 'MONTH', 'MOTOR', 'NEVER',
  'NEWLY', 'NOBLE', 'NOVEL', 'OFFER', 'OFTEN', 'ORDER', 'OTHER', 'OUTER', 'OWNER', 'PANEL',
  'PHASE', 'PHOTO', 'PIECE', 'PILOT', 'PITCH', 'PLACE', 'PLAIN', 'POINT', 'POUND', 'POWER',
  'PRESS', 'PRICE', 'PRIDE', 'PRIME', 'PRINT', 'PROOF', 'QUICK', 'QUIET', 'QUITE', 'QUOTE',
  'RAISE', 'RANGE', 'RAPID', 'REACH', 'READY', 'REPLY', 'RIGHT', 'ROUND', 'ROUTE', 'ROYAL',
  'RURAL', 'SCALE', 'SCENE', 'SCORE', 'SENSE', 'SERVE', 'SEVEN', 'SHAPE', 'SHARE', 'SHARP',
  'SHEET', 'SHIFT', 'SHINE', 'SHORT', 'SIGHT', 'SINCE', 'SKILL', 'SLEEP', 'SLIDE', 'SMALL',
  'SMART', 'SOLID', 'SOLVE', 'SOUND', 'SPACE', 'SPEAK', 'SPEED', 'SPEND', 'STAGE', 'STAND',
  'START', 'STATE', 'STICK', 'STILL', 'STUDY', 'STYLE', 'SUPER', 'SURGE', 'TEACH', 'THANK',
  'THEME', 'THICK', 'THING', 'THINK', 'THIRD', 'THREE', 'TIGHT', 'TITLE', 'TODAY', 'TOPIC',
  'TOTAL', 'TOUCH', 'TOUGH', 'TRACK', 'TRADE', 'TREND', 'TRIAL', 'TRUST', 'TRUTH', 'UNDER',
  'UNION', 'UNITY', 'UNTIL', 'UPPER', 'URBAN', 'USUAL', 'VALUE', 'VIDEO', 'VISIT', 'VITAL',
  'VOICE', 'WASTE', 'WHEAT', 'WHERE', 'WHICH', 'WHILE', 'WHITE', 'WHOLE', 'WIDTH', 'WORTH',
  'WRITE', 'WRONG', 'YOUNG', 'YOUTH', 'ZESTY',
];
