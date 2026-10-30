// Words that can be the daily answer: common, family-friendly, and weighted toward
// froyo, fruit and summer. Guesses are checked against the much larger
// allowed-guesses.json. Adding or removing a word reshuffles the schedule, including
// today's answer (see schedule.ts), so make edits between promotions, not during one.
export const ANSWERS: readonly string[] = [
  // froyo and dessert
  'CREAM', 'SWEET', 'SUGAR', 'CANDY', 'COCOA', 'FUDGE', 'TWIST', 'SCOOP', 'WAFER', 'SWIRL',
  'SAUCE', 'SYRUP', 'TREAT', 'FROST', 'CHILL', 'SPOON', 'GUMMY', 'JELLY', 'ICING', 'GLAZE',
  'CREPE', 'DONUT', 'MOCHA', 'LATTE', 'SLUSH', 'SHAKE', 'FLOAT', 'PUNCH', 'TASTE', 'CRUMB',
  'PLATE',
  // fruit, nuts and flavors
  'MANGO', 'BERRY', 'PEACH', 'LEMON', 'MELON', 'GRAPE', 'APPLE', 'GUAVA', 'HONEY', 'FRUIT',
  'JUICE', 'MAPLE', 'PECAN', 'NUTTY', 'MINTY', 'TANGY', 'ZESTY', 'CHEWY', 'CRISP', 'FRESH',
  'SPICE', 'OLIVE',
  // food
  'BREAD', 'TOAST', 'PIZZA', 'PASTA', 'SALAD', 'BAGEL', 'LUNCH', 'SNACK', 'FEAST', 'ROAST',
  'BLEND', 'GRILL', 'DINER',
  // summer, sea and weather
  'BEACH', 'OCEAN', 'SHORE', 'CORAL', 'SUNNY', 'SHADE', 'SHELL', 'SANDY', 'CLOUD', 'STORM',
  'RAINY', 'WINDY', 'SOLAR',
  // nature and flowers
  'BLOOM', 'PETAL', 'TULIP', 'DAISY', 'LILAC', 'PLANT', 'LEAFY', 'GRASS', 'FIELD', 'RIVER',
  'CREEK', 'STONE', 'CLIFF', 'TRAIL', 'EARTH', 'WORLD', 'LIGHT', 'NIGHT', 'WATER', 'FLAME',
  'SPARK', 'NORTH', 'SOUTH',
  // animals
  'TIGER', 'ZEBRA', 'HORSE', 'SHEEP', 'WHALE', 'SHARK', 'OTTER', 'PANDA', 'KOALA', 'EAGLE',
  'ROBIN', 'CRANE', 'GOOSE', 'MOUSE', 'BUNNY', 'PUPPY', 'KITTY', 'CAMEL', 'LLAMA', 'BISON',
  'MOOSE', 'TROUT', 'FINCH', 'HERON', 'STORK',
  // moods and fun
  'HAPPY', 'SMILE', 'LAUGH', 'CHEER', 'MERRY', 'PROUD', 'BRAVE', 'LUCKY', 'DREAM', 'PARTY',
  'DANCE', 'MUSIC', 'STORY', 'MOVIE', 'SPORT', 'MEDAL', 'PRIZE', 'MAGIC', 'SUPER', 'FUNNY',
  'FANCY', 'GRACE', 'CHARM', 'ENJOY', 'HELLO', 'THANK', 'HEART', 'SHINE', 'AWARD', 'GIANT',
  'QUICK', 'SMART', 'BADGE',
  // everyday things and places
  'CHAIR', 'TABLE', 'COUCH', 'CLOCK', 'PHONE', 'RADIO', 'PIANO', 'FLUTE', 'BRUSH', 'PAINT',
  'PAPER', 'SHELF', 'FRAME', 'HOUSE', 'PORCH', 'TOWER', 'BRICK', 'TRAIN', 'PLANE', 'TRUCK',
  'WAGON', 'WHEEL', 'SHIRT', 'DRESS', 'JEANS', 'SCARF', 'GLOVE', 'WATCH', 'CROWN', 'GUEST',
  'COACH', 'PLAZA', 'STORE', 'HOTEL', 'PHOTO', 'VIDEO', 'GLASS', 'GLOBE', 'PILOT', 'ROYAL',
];
