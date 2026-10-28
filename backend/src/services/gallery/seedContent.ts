import { normalizeGalleryTags } from './publish.js';

/**
 * Curated trips that seed the public gallery at launch (Milestone 8 G3 gate).
 *
 * The Explore entry stays hidden until the gallery holds at least five public
 * trips, so a brand-new deployment looks empty even though the feature works.
 * This module is the single source of truth for the launch collection; the
 * `seed:gallery` script turns it into real accounts and published trips.
 *
 * Content rules, enforced by `seedContent.test.ts`:
 * - at least five trips, each with a complete day-by-day itinerary;
 * - publisher handles/emails are deterministic, so re-running the seed updates
 *   the same accounts instead of minting new ones;
 * - summaries and tags stay inside the publish limits, so the seed cannot
 *   produce a listing the owner UI could not;
 * - dates are the *next occurrence* of a month/day anchor, so a trip written
 *   for spring stays in spring no matter when the seed runs; a trip with
 *   `startMonthDay: null` is "dates flexible" and never expires out of the
 *   gallery.
 *
 * These are editorial trips, not real travellers: every curator bio says the
 * trip was curated by the TravelAI team, and the seed accounts have random,
 * unrecorded passwords so nobody can sign into them.
 */

export const SEED_BATCH = 'm8-gallery-launch';

/** `.invalid` is reserved by RFC 2606 and can never receive mail. */
const SEED_EMAIL_DOMAIN = 'gallery-seed.travelai.invalid';

export interface SeedCurator {
  key: string;
  name: string;
  handle: string;
  bio: string;
  email: string;
}

export interface SeedActivity {
  name: string;
  time?: string;
  description?: string;
  location?: string;
}

export interface SeedDay {
  day: number;
  title: string;
  activities: SeedActivity[];
  stay_recommendations: string[];
  transport: string[];
  food_spots: string[];
  pro_tip: string[];
  permit_required: boolean;
}

export interface SeedTripDetails {
  trip_title: string;
  destination: string;
  duration_days: number;
  budget_per_person: number;
  season: string;
  group_type: string;
  highlights: string[];
  weather_advisory: {
    expected_weather: string;
    packing_tips: string[];
    risks: string[];
    seasonal_highlights: string[];
  };
  day_by_day_itinerary: SeedDay[];
  budget_breakdown: {
    accommodation: number;
    food_and_drinks: number;
    activities_and_entry: number;
    local_transport: number;
    miscellaneous_buffer: number;
    total: number;
  };
  local_transport: {
    walking: string;
    local_buses: string;
    tips: string[];
  };
  footnotes_safety_tips: {
    cultural_etiquette: string[];
    safety: string[];
  };
}

export interface SeedTrip {
  key: string;
  curatorKey: string;
  title: string;
  destination: string;
  /**
   * Next occurrence of this 1-based month and day (UTC). `null` renders as
   * “Dates flexible”; a seasonal trip anchored to a month keeps its copy in
   * season regardless of when the seed runs.
   */
  startMonthDay: { month: number; day: number } | null;
  hideExactDates: boolean;
  summary: string;
  tags: string[];
  tripDetails: SeedTripDetails;
}

export interface BuiltSeedTrip extends SeedTrip {
  startDate?: Date;
  endDate?: Date;
}

function activity(
  name: string,
  time: string,
  description: string,
  location?: string
): SeedActivity {
  return location ? { name, time, description, location } : { name, time, description };
}

function day(
  number: number,
  title: string,
  activities: SeedActivity[],
  stay: string,
  transport: string[],
  food: string[],
  tip: string
): SeedDay {
  return {
    day: number,
    title,
    activities,
    stay_recommendations: stay ? [stay] : [],
    transport,
    food_spots: food,
    pro_tip: [tip],
    permit_required: false,
  };
}

function budget(total: number): SeedTripDetails['budget_breakdown'] {
  const accommodation = Math.round(total * 0.4);
  const food_and_drinks = Math.round(total * 0.25);
  const activities_and_entry = Math.round(total * 0.2);
  const local_transport = Math.round(total * 0.1);
  return {
    accommodation,
    food_and_drinks,
    activities_and_entry,
    local_transport,
    miscellaneous_buffer: total - accommodation - food_and_drinks - activities_and_entry - local_transport,
    total,
  };
}

export const SEED_CURATORS: SeedCurator[] = [
  {
    key: 'maya',
    name: 'Maya Rao',
    handle: 'maya_roams',
    bio: 'Curated by the TravelAI team. Slow travel, long lunches and train windows.',
    email: `maya@${SEED_EMAIL_DOMAIN}`,
  },
  {
    key: 'rohan',
    name: 'Rohan Mehta',
    handle: 'rohan_offbeat',
    bio: 'Curated by the TravelAI team. Weekend escapes and mountain air.',
    email: `rohan@${SEED_EMAIL_DOMAIN}`,
  },
  {
    key: 'sofia',
    name: 'Sofia Marchetti',
    handle: 'sofia_slow',
    bio: 'Curated by the TravelAI team. Coastal walks and market mornings.',
    email: `sofia@${SEED_EMAIL_DOMAIN}`,
  },
  {
    key: 'kenji',
    name: 'Kenji Abe',
    handle: 'kenji_walks',
    bio: 'Curated by the TravelAI team. City walks, quiet gardens and good coffee.',
    email: `kenji@${SEED_EMAIL_DOMAIN}`,
  },
];

export const SEED_TRIPS: SeedTrip[] = [
  {
    key: 'lisbon-slow',
    curatorKey: 'maya',
    title: 'Lisbon in six slow days',
    destination: 'Lisbon, Portugal',
    startMonthDay: { month: 4, day: 10 },
    hideExactDates: false,
    summary:
      'Six unhurried days of tiled streets, river light and pastéis de nata — with one Sintra day trip and enough time left over to get lost in Alfama.',
    tags: ['portugal', 'slow-travel', 'food', 'city-break'],
    tripDetails: {
      trip_title: 'Lisbon in six slow days',
      destination: 'Lisbon, Portugal',
      duration_days: 6,
      budget_per_person: 85000,
      season: 'Spring',
      group_type: 'Couple',
      highlights: [
        'Sunrise over Alfama from Senhora do Monte',
        'Pastéis de Belém straight from the oven',
        'The tile museum and Feira da Ladra in one morning',
        'A day trip to Pena Palace and Quinta da Regaleira',
      ],
      weather_advisory: {
        expected_weather: 'Mild 16–22°C days with a few Atlantic showers and bright evenings.',
        packing_tips: ['Light layers and a packable rain jacket', 'Comfortable shoes for cobblestones', 'Sunglasses for the riverfront'],
        risks: ['Steep lanes get slippery after rain', 'Tram 28 is a pickpocket hotspot'],
        seasonal_highlights: ['Jacarandas in bloom', 'Long café terraces before summer crowds'],
      },
      day_by_day_itinerary: [
        day(
          1,
          'Arrive and settle into Alfama',
          [
            activity('Check in and wander the Alfama lanes', '15:00', 'Drop bags, then follow the tram tracks uphill without a plan.', 'Alfama'),
            activity('Sunset at Miradouro da Senhora do Monte', '19:00', 'The quietest of the big viewpoints, with the castle across the rooftops.', 'Graça'),
            activity('Dinner at a tiny tasca', '20:30', 'Grilled fish, green wine and a handwritten menu.', 'Alfama'),
          ],
          'Boutique guesthouse in Alfama',
          ['Airport metro to Baixa-Chiado, then a short taxi uphill'],
          ['A tasca near Largo do Chafariz de Dentro'],
          'Buy a Viva Viagem card at the airport — it covers metro, trams and ferries.'
        ),
        day(
          2,
          'Baixa, Chiado and the river',
          [
            activity('Coffee at A Brasileira', '09:30', 'Stand at the counter like locals do.', 'Chiado'),
            activity('Walk Rua Augusta down to the river', '11:00', 'Cross the triumphal arch and follow the waterfront towards Alcântara.'),
            activity('Lunch in Bairro Alto', '13:30', 'Order the daily prato do dia and a half bottle of vinho verde.', 'Bairro Alto'),
            activity('Fado in a small house', '21:00', 'Book a 45-minute set rather than a long dinner show.', 'Alfama'),
          ],
          'Boutique guesthouse in Alfama',
          ['Walk, plus the Santa Justa lift for the novelty'],
          ['Time Out Market for a low-effort lunch backup'],
          'Reserve fado the morning of — the small houses sell out by afternoon.'
        ),
        day(
          3,
          'Belém and the river',
          [
            activity('Jerónimos Monastery', '09:30', 'Go straight at opening; the cloister is the highlight.', 'Belém'),
            activity('Pastéis de Belém', '11:30', 'Take them warm, with cinnamon, at the counter.', 'Belém'),
            activity('MAAT and the riverfront walk', '14:00', 'The rooftop gives you the 25 de Abril bridge and the whole estuary.', 'Belém'),
          ],
          'Boutique guesthouse in Alfama',
          ['Tram 15 from Praça da Figueira'],
          ['Pastéis de Belém', 'Nosolo Italia for a quick river-side salad'],
          'The monastery ticket includes the archaeology museum — buy online and skip the queue.'
        ),
        day(
          4,
          'Sintra day trip',
          [
            activity('Pena Palace', '09:00', 'First timed entry means empty terraces and clear photos.', 'Sintra'),
            activity('Quinta da Regaleira', '12:30', 'The initiation wells are the reason to come; bring a small torch.', 'Sintra'),
            activity('Lunch and a slow wander in Sintra town', '14:30', 'Try travesseiros from Piriquita before the train back.', 'Sintra'),
          ],
          'Boutique guesthouse in Alfama',
          ['Train from Rossio, then the 434 bus up to Pena'],
          ['Piriquita', 'Casa Piriquita’s travesseiros'],
          'Skip the Moorish Castle if you only have one day — Pena plus Regaleira is enough.'
        ),
        day(
          5,
          'Tiles, markets and viewpoints',
          [
            activity('National Tile Museum', '10:00', 'The 25-metre Lisbon panorama is worth the trip east.', 'Xabregas'),
            activity('Feira da Ladra flea market', '13:00', 'Rummage for old azulejos and postcards; it runs Tuesday and Saturday.', 'Alfama'),
            activity('Miradouro da Graça and ginjinha', '17:30', 'A tiny cup of sour cherry liqueur at the kiosk.', 'Graça'),
          ],
          'Boutique guesthouse in Alfama',
          ['Bus 794 to the tile museum, tram back'],
          ['A kiosk snack at the Graça viewpoint'],
          'Most stalls close by 15:00 — go before lunch if you want the full market.'
        ),
        day(
          6,
          'A slow Sunday and departure',
          [
            activity('LX Factory brunch', '10:00', 'Books, coffee and a last long breakfast under the bridge.', 'Alcântara'),
            activity('Riverfront walk to Cais do Sodré', '12:30', 'Follow the water back towards the city.'),
            activity('One last pastel de nata', '14:00', 'Eat it standing up. It counts as a ritual.', 'Baixa'),
          ],
          '',
          ['Tram 15 to Cais do Sodré, then the airport metro'],
          ['LX Factory food stalls'],
          'Keep two hours for the airport on a Sunday — the metro is direct but slow.'
        ),
      ],
      budget_breakdown: budget(85000),
      local_transport: {
        walking: 'Most of the centre is walkable; the hills are the workout.',
        local_buses: 'Trams and buses are covered by the Viva Viagem card; top up as you go.',
        tips: ['Validate every trip', 'Taxis are cheap for late-night returns uphill'],
      },
      footnotes_safety_tips: {
        cultural_etiquette: ['Smoking is banned inside most cafés', 'Small tascas prefer cash'],
        safety: ['Watch for pickpockets on tram 28', 'Cobblestones are slippery in the rain'],
      },
    },
  },
  {
    key: 'kyoto-rush-free',
    curatorKey: 'kenji',
    title: 'Kyoto without the rush',
    destination: 'Kyoto, Japan',
    startMonthDay: { month: 11, day: 2 },
    hideExactDates: true,
    summary:
      'Seven calm days built around early shrines, quiet gardens and one day trip to Nara. Early starts, long lunches, and nowhere to be by dinner.',
    tags: ['japan', 'temples', 'autumn', 'solo-travel'],
    tripDetails: {
      trip_title: 'Kyoto without the rush',
      destination: 'Kyoto, Japan',
      duration_days: 7,
      budget_per_person: 160000,
      season: 'Autumn',
      group_type: 'Solo',
      highlights: [
        'Fushimi Inari at sunrise, before the crowds',
        'The philosopher’s path in peak maple season',
        'A tea ceremony in a machiya townhouse',
        'Nara’s deer park and Todai-ji in one easy day',
      ],
      weather_advisory: {
        expected_weather: 'Crisp 10–20°C days, cool mornings and very little rain.',
        packing_tips: ['A warm layer for shrine mornings', 'Slip-on shoes for temple floors', 'A small day bag for the Nara trip'],
        risks: ['Autumn leaves bring weekend crowds', 'Some temples close by 16:30'],
        seasonal_highlights: ['Maple season from mid-November', 'Ginkgo trees around the Imperial Palace'],
      },
      day_by_day_itinerary: [
        day(
          1,
          'Arrive and slip into Higashiyama',
          [
            activity('Check in near Kyoto Station', '14:00', 'Leave the suitcase and take the short walk east.'),
            activity('Higashiyama lanes at dusk', '16:30', 'Start at Yasaka Shrine and let the crowd carry you north.'),
            activity('Dinner in Pontocho', '19:00', 'A narrow alley of tiny counters along the river.', 'Pontocho'),
          ],
          'Small hotel near Kyoto Station',
          ['Haruka train from Kansai Airport'],
          ['A counter seat in Pontocho'],
          'Buy an IC card at the station — it works on buses, subways and convenience stores.'
        ),
        day(
          2,
          'Fushimi Inari before breakfast',
          [
            activity('Fushimi Inari at sunrise', '06:30', 'Climb to the Yotsutsuji junction; the upper paths are almost empty.', 'Fushimi'),
            activity('Breakfast near Inari station', '09:00', 'Simple rice and soup before the next stop.'),
            activity('Tofuku-ji and its moss garden', '11:00', 'Quiet on weekdays, spectacular in maple season.', 'Higashiyama'),
          ],
          'Small hotel near Kyoto Station',
          ['JR Nara line to Inari, then back east'],
          ['A bakery near Inari station'],
          'The full summit loop takes two hours; the junction view is enough for most people.'
        ),
        day(
          3,
          'Arashiyama and the river',
          [
            activity('Tenryu-ji garden', '08:30', 'The borrowed-landscape garden opens before the tour buses.', 'Arashiyama'),
            activity('Bamboo grove and Okochi Sanso villa', '10:30', 'Pay the villa entry — it includes tea and a quiet garden.'),
            activity('Lunch by the Katsura river', '13:00', 'Then walk to the Togetsukyo bridge and back.'),
          ],
          'Small hotel near Kyoto Station',
          ['JR Sagano line to Saga-Arashiyama'],
          ['Shojin lunch near Tenryu-ji'],
          'Skip the monkey park if it is raining; the river walk is better wet anyway.'
        ),
        day(
          4,
          'Market, palace and tea',
          [
            activity('Nishiki Market breakfast crawl', '09:00', 'Tamagoyaki, pickles and soy milk doughnuts.', 'Nishiki'),
            activity('Kyoto Imperial Palace gardens', '12:00', 'Free entry, wide gravel paths and very few tourists.', 'Kamigyo'),
            activity('Tea ceremony in a machiya', '15:00', 'Book a small-group session rather than a tourist show.'),
          ],
          'Small hotel near Kyoto Station',
          ['Subway to Shijo, walk north'],
          ['Nishiki Market stalls'],
          'The palace is closed on Mondays — check before you build the day around it.'
        ),
        day(
          5,
          'Kiyomizu-dera and Gion',
          [
            activity('Kiyomizu-dera at opening', '07:00', 'The terrace is at its best before nine.', 'Higashiyama'),
            activity('Sannenzaka and Ninenzaka', '09:30', 'Descend slowly; the lanes are the destination.'),
            activity('Evening walk through Gion', '18:00', 'Stay off private alleys and keep a respectful distance from geiko.', 'Gion'),
          ],
          'Small hotel near Kyoto Station',
          ['Bus 206 to Kiyomizu-michi'],
          ['A soba lunch near Yasaka Shrine'],
          'Photography is restricted in parts of Gion — follow the small signs.'
        ),
        day(
          6,
          'Nara day trip',
          [
            activity('Nara Park and the deer', '09:30', 'Buy deer crackers only where the vendors sell them.', 'Nara'),
            activity('Todai-ji Great Buddha', '11:30', 'The hall is one of the largest wooden buildings in the world.', 'Nara'),
            activity('Kasuga Taisha lantern path', '14:00', 'Then a slow train back to Kyoto.', 'Nara'),
          ],
          'Small hotel near Kyoto Station',
          ['Kintetsu line to Nara, about 45 minutes'],
          ['Kakinoha sushi near the station'],
          'Bows from the deer are a food signal, not a greeting — keep the crackers out of sight.'
        ),
        day(
          7,
          'Philosopher’s Path and departure',
          [
            activity('Philosopher’s Path', '08:00', 'Walk from Ginkaku-ji south along the canal.'),
            activity('Ginkaku-ji and a last coffee', '10:30', 'The sand garden is best in clean morning light.', 'Sakyo'),
            activity('Pick up a bento for the train', '13:00', 'Eat it on the Haruka like everyone else.'),
          ],
          '',
          ['Bus to Kyoto Station, Haruka to the airport'],
          ['A station bento'],
          'Autumn weekends double the path traffic; a weekday morning is a different walk.'
        ),
      ],
      budget_breakdown: budget(160000),
      local_transport: {
        walking: 'The east side is a walking neighbourhood; plan one area per day.',
        local_buses: 'Buses are frequent but slow in traffic; the subway is faster for longer hops.',
        tips: ['IC cards work everywhere', 'Avoid the 100-yen loop bus in peak season'],
      },
      footnotes_safety_tips: {
        cultural_etiquette: ['Do not eat while walking through shrine grounds', 'Quiet voices in residential lanes'],
        safety: ['Temples close gates at dusk', 'Keep an eye on belongings in crowded markets'],
      },
    },
  },
  {
    key: 'rajasthan-forts',
    curatorKey: 'rohan',
    title: 'Rajasthan forts and desert nights',
    destination: 'Jaipur, Jodhpur & Jaisalmer, India',
    startMonthDay: { month: 1, day: 28 },
    hideExactDates: false,
    summary:
      'Eight days across three fort cities by road, ending with a night in the Thar desert. Long drives, early forts, and the best lassi of your life in Jodhpur.',
    tags: ['india', 'forts', 'desert', 'road-trip'],
    tripDetails: {
      trip_title: 'Rajasthan forts and desert nights',
      destination: 'Jaipur, Jodhpur & Jaisalmer, India',
      duration_days: 8,
      budget_per_person: 42000,
      season: 'Winter',
      group_type: 'Friends',
      highlights: [
        'Amber Fort before the tour buses',
        'Mehrangarh from the blue city rooftops',
        'A night under the stars near Jaisalmer',
        'Havelis and stepwells in the old towns',
      ],
      weather_advisory: {
        expected_weather: 'Sunny 22–28°C days and cold desert nights around 8°C.',
        packing_tips: ['A warm layer for the desert night', 'Sun hat and high-factor sunscreen', 'A scarf for dust and temple visits'],
        risks: ['Long road stretches with limited services', 'Fort stairs are steep and uneven'],
        seasonal_highlights: ['Clear desert skies', 'Comfortable daytime walking weather'],
      },
      day_by_day_itinerary: [
        day(
          1,
          'Arrive in Jaipur',
          [
            activity('Check in inside the old city', '13:00', 'Pick a haveli within walking distance of the bazaars.'),
            activity('City Palace and Hawa Mahal', '15:30', 'See the palace first, then the facade from the café opposite.'),
            activity('Johari Bazaar at dusk', '18:30', 'Gemstones, textiles and street food in one loop.', 'Johari Bazaar'),
          ],
          'Haveli in Jaipur old city',
          ['Airport taxi, roughly 30 minutes'],
          ['Rawat Mishthan Bhandar for pyaaz kachori'],
          'Fixed-price shops near the palace are convenient; the bazaar rewards a walk.'
        ),
        day(
          2,
          'Amber Fort and the stepwells',
          [
            activity('Amber Fort at opening', '08:00', 'Walk up rather than taking the jeep; the first courtyard is empty at eight.', 'Amber'),
            activity('Panna Meena ka Kund', '11:00', 'The symmetrical stepwell is a five-minute stop on the way down.', 'Amer'),
            activity('Jal Mahal at sunset', '17:30', 'Best from the far side of the road for the reflection.'),
          ],
          'Haveli in Jaipur old city',
          ['Private car for the day; the fort road is one-way in the morning'],
          ['A thali lunch near Amer'],
          'Skip the elephant rides — the walk up is 15 minutes and the fort is better without them.'
        ),
        day(
          3,
          'Road to Jodhpur',
          [
            activity('Drive to Jodhpur', '08:00', 'About six hours with a chai stop; leave early to miss the truck traffic.'),
            activity('Mehrangarh Fort', '15:30', 'Go straight up for the audio guide and the ramparts view.', 'Jodhpur'),
            activity('Rooftop dinner under the fort', '19:30', 'The floodlit walls are the whole show.', 'Jodhpur'),
          ],
          'Guesthouse below Mehrangarh',
          ['Private car for the drive'],
          ['Rooftop dinner in the old city'],
          'Buy the combined Mehrangarh ticket — it includes the museum and the walk down to the blue city.'
        ),
        day(
          4,
          'Jodhpur’s blue lanes',
          [
            activity('Blue city walk', '09:00', 'Start at Navchokiya and follow whichever lane looks steepest.'),
            activity('Toorji ka Jhalra stepwell', '11:30', 'Coffee at the stepwell square and watch the morning swimmers.', 'Jodhpur'),
            activity('Clock tower market', '17:00', 'Spices, sweets and the famous makhaniya lassi.', 'Sardar Market'),
          ],
          'Guesthouse below Mehrangarh',
          ['Auto-rickshaws for the lanes'],
          ['Makhaniya lassi at Shri Mishrilal Hotel'],
          'Dress modestly for the blue-city walk — it is a residential neighbourhood.'
        ),
        day(
          5,
          'Into the Thar',
          [
            activity('Drive to Jaisalmer via Osian', '07:30', 'Stop at the Osian temples, then carry on west.'),
            activity('Check in at a desert camp', '15:00', 'Drop bags and take a jeep to the dunes.'),
            activity('Sunset and dinner in the dunes', '17:30', 'Camel ride optional; the silence is the point.', 'Sam dunes'),
          ],
          'Desert camp near Jaisalmer',
          ['Private car, then a camp jeep'],
          ['Camp dinner under the stars'],
          'Take a torch and a warm layer; desert nights drop fast once the sun is gone.'
        ),
        day(
          6,
          'Jaisalmer fort and havelis',
          [
            activity('Jaisalmer Fort', '09:00', 'The living fort is best before the day-trippers arrive.', 'Jaisalmer'),
            activity('Patwon ki Haveli', '11:30', 'Five connected mansions and the best carved facades in the city.', 'Jaisalmer'),
            activity('Gadisar Lake at sunset', '17:30', 'Boats, birds and the old gateways on the water.', 'Jaisalmer'),
          ],
          'Haveli inside Jaisalmer fort',
          ['Walk inside the old city'],
          ['Kesar da dhaba for a simple thali'],
          'Stay inside the fort once — the lanes empty out after the day crowd leaves.'
        ),
        day(
          7,
          'Back to Jodhpur',
          [
            activity('Slow morning in the fort lanes', '09:00', 'Breakfast on a rooftop before the drive.'),
            activity('Drive to Jodhpur', '11:00', 'Roughly five hours with a lunch stop.'),
            activity('Last market walk', '18:00', 'Pick up spices and textiles before dinner.', 'Sardar Market'),
          ],
          'Guesthouse below Mehrangarh',
          ['Private car for the drive'],
          ['Street-side kachori'],
          'Keep the final night in Jodhpur so the airport run is short and unhurried.'
        ),
        day(
          8,
          'Depart',
          [
            activity('Breakfast and airport transfer', '08:00', 'Leave buffer for the morning flight bank.'),
          ],
          '',
          ['Airport taxi, 20 minutes'],
          [],
          'Jodhpur airport is small; 90 minutes before departure is plenty.'
        ),
      ],
      budget_breakdown: budget(42000),
      local_transport: {
        walking: 'Old towns are walkable; forts are steep.',
        local_buses: 'Intercity buses exist but a private car saves a full day across three cities.',
        tips: ['Agree car fares in advance', 'Carry small cash for parking and tips'],
      },
      footnotes_safety_tips: {
        cultural_etiquette: ['Remove shoes at temples', 'Ask before photographing people'],
        safety: ['Carry water on long drives', 'Avoid unlit lanes after dark in the old towns'],
      },
    },
  },
  {
    key: 'amalfi-weekend',
    curatorKey: 'sofia',
    title: 'Amalfi coast long weekend',
    destination: 'Amalfi & Positano, Italy',
    startMonthDay: null,
    hideExactDates: false,
    summary:
      'Four days of ferries, lemon terraces and one big coastal hike. A weekend that works from Naples with no car and no fixed dates.',
    tags: ['italy', 'coast', 'weekend', 'hiking'],
    tripDetails: {
      trip_title: 'Amalfi coast long weekend',
      destination: 'Amalfi & Positano, Italy',
      duration_days: 4,
      budget_per_person: 95000,
      season: 'Early summer',
      group_type: 'Couple',
      highlights: [
        'The Path of the Gods above Positano',
        'Villa Cimbrone’s terrace in Ravello',
        'Ferry hops instead of coastal traffic',
        'Lemon granita between swims',
      ],
      weather_advisory: {
        expected_weather: 'Warm 22–28°C days with strong midday sun and calm evenings.',
        packing_tips: ['Swimwear and a quick-dry towel', 'Grippy shoes for the coastal path', 'A light layer for ferry wind'],
        risks: ['Paths close in heavy rain', 'Ferries stop running in rough seas'],
        seasonal_highlights: ['Lemon groves in fruit', 'Long swim season from June'],
      },
      day_by_day_itinerary: [
        day(
          1,
          'Naples to Amalfi',
          [
            activity('Ferry from Naples to Amalfi', '11:00', 'Sit on the top deck for the first view of the coast.'),
            activity('Check in and passeggiata', '16:00', 'Walk the seafront to the old arsenal and back.', 'Amalfi'),
            activity('Dinner above the harbour', '20:00', 'Book a table with a view before you leave home.', 'Amalfi'),
          ],
          'Seafront guesthouse in Amalfi',
          ['Ferry from Naples Beverello, about 90 minutes'],
          ['A trattoria above the duomo steps'],
          'Ferries are far more reliable than the coastal road in summer — plan around them.'
        ),
        day(
          2,
          'Path of the Gods',
          [
            activity('Bus to Bomerano', '07:30', 'The early bus beats both the heat and the crowds.'),
            activity('Hike Sentiero degli Dei to Nocelle', '09:00', 'Three hours of ridge walking with the whole coast below you.'),
            activity('Descend to Positano and swim', '14:30', 'Take the 1,700 steps down, then find a beach.', 'Positano'),
          ],
          'Seafront guesthouse in Amalfi',
          ['Bus up, ferry back'],
          ['A panino in Nocelle before the descent'],
          'Bring two litres of water — the ridge has one refill point at the start.'
        ),
        day(
          3,
          'Ravello and the gardens',
          [
            activity('Ferry to Amalfi, then bus to Ravello', '09:00', 'The bus climbs fast; sit on the right for the view.'),
            activity('Villa Cimbrone terrace', '11:00', 'The Terrace of Infinity is worth the entry fee on its own.', 'Ravello'),
            activity('Lemon terrace lunch and Villa Rufolo', '13:30', 'Then a slow return by bus and ferry.'),
          ],
          'Seafront guesthouse in Amalfi',
          ['Ferry plus the SITA bus'],
          ['Lemon cake at a Ravello café'],
          'Ravello is quieter in the morning; the afternoon buses back fill up quickly.'
        ),
        day(
          4,
          'Swim and depart',
          [
            activity('Morning swim at Santa Croce', '09:00', 'A small pebble beach a short walk east of Amalfi.', 'Amalfi'),
            activity('Ferry to Salerno for the train', '12:30', 'Salerno has fast trains north and a much calmer port.'),
          ],
          '',
          ['Ferry to Salerno, then a high-speed train'],
          ['Granita on the seafront'],
          'Book the Salerno ferry the day before; the last morning crossing is small.'
        ),
      ],
      budget_breakdown: budget(95000),
      local_transport: {
        walking: 'Villages are staircases; pack light and walk between beaches where you can.',
        local_buses: 'SITA buses connect the towns but fill up; ferries are faster in summer.',
        tips: ['Validate bus tickets on board', 'Keep ferry tickets on your phone'],
      },
      footnotes_safety_tips: {
        cultural_etiquette: ['Cover shoulders inside churches', 'Beach clubs charge for loungers — ask first'],
        safety: ['Coastal path is exposed at midday', 'Rocks near the water are slippery'],
      },
    },
  },
  {
    key: 'bali-slow',
    curatorKey: 'sofia',
    title: 'First time in Bali, done slowly',
    destination: 'Ubud & Uluwatu, Bali',
    startMonthDay: { month: 6, day: 25 },
    hideExactDates: true,
    summary:
      'A week split between rice terraces and a surf beach, with one island day trip. Two bases, no rushing, and enough spa time to actually relax.',
    tags: ['indonesia', 'beaches', 'surf', 'wellness'],
    tripDetails: {
      trip_title: 'First time in Bali, done slowly',
      destination: 'Ubud & Uluwatu, Bali',
      duration_days: 7,
      budget_per_person: 70000,
      season: 'Dry season',
      group_type: 'Solo',
      highlights: [
        'Rice terrace walk at first light',
        'A water blessing at Tirta Empul',
        'Kecak sunset at Uluwatu',
        'A beginner surf lesson at Bingin',
      ],
      weather_advisory: {
        expected_weather: 'Hot, humid 26–31°C days with strong sun and short afternoon showers.',
        packing_tips: ['Reef-safe sunscreen', 'Quick-dry clothing', 'A sarong for temples'],
        risks: ['Scooter traffic is not beginner-friendly', 'Monkeys grab loose items'],
        seasonal_highlights: ['Dry season surf on the Bukit', 'Clear mornings for volcano views'],
      },
      day_by_day_itinerary: [
        day(
          1,
          'Arrive and settle in Ubud',
          [
            activity('Airport transfer to Ubud', '13:00', 'Roughly 90 minutes depending on traffic.'),
            activity('Rice field walk at dusk', '17:00', 'Follow the path behind the main street towards the paddy fields.'),
            activity('Dinner on a garden terrace', '19:30', 'Simple nasi campur and a very early night.', 'Ubud'),
          ],
          'Guesthouse among the rice fields',
          ['Pre-booked airport car'],
          ['Warung nasi campur'],
          'Ubud is dark by seven; walking the rice paths after dinner needs a torch.'
        ),
        day(
          2,
          'Ubud town and the monkey forest',
          [
            activity('Ubud market at opening', '08:00', 'The produce market beats the souvenir stalls an hour later.', 'Ubud'),
            activity('Sacred Monkey Forest', '10:00', 'Keep bags zipped and sunglasses on your face.', 'Ubud'),
            activity('Balinese massage', '15:00', 'Book a two-hour session; it is the best value on the island.'),
          ],
          'Guesthouse among the rice fields',
          ['Walk; Ubud centre is compact'],
          ['Babi guling at a warung'],
          'Monkeys are quick — leave water bottles and loose jewellery at the guesthouse.'
        ),
        day(
          3,
          'Terraces and a water blessing',
          [
            activity('Tegallalang terraces at sunrise', '06:30', 'Arrive before the swings and the tour vans.', 'Tegallalang'),
            activity('Tirta Empul water blessing', '09:30', 'Bring a sarong and follow the local queue.', 'Tampaksiring'),
            activity('Coffee plantation stop', '13:00', 'Ask for the tasting without the sales pitch.'),
          ],
          'Guesthouse among the rice fields',
          ['Hire a driver for the morning loop'],
          ['A roadside warung near Tirta Empul'],
          'The blessing pool has cold, fast water — keep phones and bags well back.'
        ),
        day(
          4,
          'Move south to Uluwatu',
          [
            activity('Drive to Uluwatu', '10:00', 'Two hours south; stop for lunch on the way.'),
            activity('Uluwatu Temple at sunset', '17:00', 'The kecak performance starts around six.', 'Uluwatu'),
            activity('Seafood dinner on the sand', '19:30', 'Jimbaran is a short drive north.', 'Jimbaran'),
          ],
          'Cliffside guesthouse in Uluwatu',
          ['Private car for the transfer'],
          ['Jimbaran seafood grills'],
          'Hold onto sunglasses and phones at the temple — the monkeys have a business model.'
        ),
        day(
          5,
          'Surf and beach day',
          [
            activity('Beginner surf lesson at Bingin', '07:30', 'Early water is glassy and the instructors are less rushed.', 'Bingin'),
            activity('Beach lunch and a long swim', '12:30', 'Stay off the reef at low tide.', 'Bingin'),
            activity('Sunset at Padang Padang', '17:30', 'Small, busy and worth one visit.'),
          ],
          'Cliffside guesthouse in Uluwatu',
          ['Scooter taxi or a short car hop'],
          ['Beach café smoothie bowls'],
          'Reef shoes make the Bingin stairs and shallows much easier on the feet.'
        ),
        day(
          6,
          'Nusa Penida day trip',
          [
            activity('Fast boat to Nusa Penida', '07:00', 'Book the first crossing to beat the day-trippers.', 'Sanur'),
            activity('Kelingking viewpoint', '10:00', 'The cliff path is steep; the fence is advisory, not a handrail.', 'Nusa Penida'),
            activity('Crystal Bay swim and boat back', '14:30', 'Then an early dinner in Sanur.'),
          ],
          'Cliffside guesthouse in Uluwatu',
          ['Fast boat from Sanur plus a local driver'],
          ['Warung lunch on Nusa Penida'],
          'Nusa Penida roads are rough; a local driver is safer than a rented scooter.'
        ),
        day(
          7,
          'Slow morning and departure',
          [
            activity('Café breakfast in Uluwatu', '08:30', 'One last long breakfast before the airport.'),
            activity('Airport transfer', '11:00', 'Allow two hours in dry-season traffic.'),
          ],
          '',
          ['Pre-booked car to the airport'],
          ['Uluwatu café breakfast'],
          'Keep the final night in Uluwatu — the airport is 45 minutes, not two hours.'
        ),
      ],
      budget_breakdown: budget(70000),
      local_transport: {
        walking: 'Ubud’s centre is walkable; the Bukit is not.',
        local_buses: 'No useful public transport; use pre-booked cars or ride-hailing apps.',
        tips: ['Agree car prices before departure', 'Avoid renting a scooter without experience'],
      },
      footnotes_safety_tips: {
        cultural_etiquette: ['Wear a sarong at temples', 'Use your right hand to give and receive'],
        safety: ['Do not swim outside flagged areas', 'Drink bottled or filtered water'],
      },
    },
  },
  {
    key: 'highlands-roadtrip',
    curatorKey: 'rohan',
    title: 'Scottish Highlands road trip',
    destination: 'Scottish Highlands & Skye',
    startMonthDay: null,
    hideExactDates: false,
    summary:
      'Five days from Edinburgh to Skye and back, built around two big hikes and a lot of roadside stops. A flexible spring route for a small group with one car.',
    tags: ['scotland', 'road-trip', 'hiking', 'castles'],
    tripDetails: {
      trip_title: 'Scottish Highlands road trip',
      destination: 'Scottish Highlands & Skye',
      duration_days: 5,
      budget_per_person: 110000,
      season: 'Late spring',
      group_type: 'Friends',
      highlights: [
        'Glencoe’s Lost Valley hike',
        'The Glenfinnan Viaduct from the hillside',
        'The Quiraing loop on Skye',
        'Eilean Donan on the way home',
      ],
      weather_advisory: {
        expected_weather: 'Changeable 8–16°C days; sun, wind and rain can all arrive in an hour.',
        packing_tips: ['Waterproof shell and trousers', 'Midge repellent for still evenings', 'Sturdy boots for boggy paths'],
        risks: ['Single-track roads with passing places', 'Weather can close the Skye bridge approaches'],
        seasonal_highlights: ['Long daylight until late evening', 'Snow still on the highest tops'],
      },
      day_by_day_itinerary: [
        day(
          1,
          'Edinburgh to Loch Lomond',
          [
            activity('Pick up the car and head west', '09:00', 'Leave the city before the morning commute.'),
            activity('Luss village walk', '12:00', 'A short loch-side stroll to break up the drive.', 'Luss'),
            activity('Evening in Glencoe', '17:00', 'Check in, then drive the valley road for the light.', 'Glencoe'),
          ],
          'Guesthouse in Glencoe',
          ['Rental car from Edinburgh'],
          ['Pub dinner in Ballachulish'],
          'Fill the tank before Glencoe — the next easy petrol stop is Fort William.'
        ),
        day(
          2,
          'Glencoe and the Lost Valley',
          [
            activity('Lost Valley hike', '09:00', 'Two to three hours up a boggy path with a dramatic bowl at the top.', 'Glencoe'),
            activity('Glen Etive detour', '14:00', 'A single-track road to the water; go slowly and use passing places.'),
            activity('Fort William for the night', '18:00', 'Laundry, a proper dinner and an early start tomorrow.', 'Fort William'),
          ],
          'Guesthouse in Fort William',
          ['Car, with a short walk at each stop'],
          ['Fish and chips on the Fort William high street'],
          'The Lost Valley path floods after rain — waterproof boots are not optional.'
        ),
        day(
          3,
          'Glenfinnan and over to Skye',
          [
            activity('Glenfinnan Viaduct viewpoint', '09:00', 'Walk up the hillside path for the classic angle.', 'Glenfinnan'),
            activity('Road to Skye via Eilean Donan', '13:00', 'Stop at the castle viewpoint, then cross the bridge.', 'Kyle of Lochalsh'),
            activity('Portree harbour at dusk', '18:30', 'Book dinner — the town is small and busy in season.', 'Portree'),
          ],
          'Guesthouse in Portree',
          ['Car; the Skye bridge makes the crossing easy'],
          ['Harbour seafood in Portree'],
          'Check the bridge webcam in winter — high winds occasionally close it to high-sided vehicles.'
        ),
        day(
          4,
          'Trotternish Peninsula',
          [
            activity('Quiraing loop', '08:30', 'Two hours on a muddy, spectacular ridge; start early for parking.', 'Trotternish'),
            activity('Fairy Glen', '12:30', 'A short walk through small green cones and a ruined fort.', 'Uig'),
            activity('Old Man of Storr', '15:30', 'The lower viewpoint is enough if the cloud is low.'),
          ],
          'Guesthouse in Portree',
          ['Car between trailheads'],
          ['Café lunch in Uig'],
          'The Quiraing car park fills by ten; the loop is worth the early alarm.'
        ),
        day(
          5,
          'Skye to Edinburgh',
          [
            activity('Eilean Donan Castle', '09:30', 'Cross early and stop before the tour buses arrive.', 'Dornie'),
            activity('Drive back through the Cairngorms', '13:00', 'Take the A9 south with a lunch stop in Pitlochry.'),
            activity('Return the car in Edinburgh', '18:00', 'Leave buffer for roadworks on the A9.'),
          ],
          '',
          ['Car back to Edinburgh'],
          ['Pitlochry bakery stop'],
          'Return the car with a full tank if your rental terms ask for it — the airport station is expensive.'
        ),
      ],
      budget_breakdown: budget(110000),
      local_transport: {
        walking: 'Every stop has a short walk; boots are the main transport on hiking days.',
        local_buses: 'Buses exist between towns but not at trailheads; a car is the point of this trip.',
        tips: ['Use passing places on single-track roads', 'Do not park in passing places'],
      },
      footnotes_safety_tips: {
        cultural_etiquette: ['Close gates on farmland', 'Take all litter with you'],
        safety: ['Tell someone your hiking route', 'Midges are worst at still dusk'],
      },
    },
  },
];

/** UTC midnight of the seed run date; keeps date maths deterministic. */
export function startOfUtcDay(baseDate: Date): Date {
  const date = new Date(baseDate.getTime());
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/** Adds whole days without crossing daylight-saving boundaries in UTC. */
export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * The next UTC occurrence of a month/day at least `MIN_DAYS_AHEAD` out. An
 * anchor that is already past — or too close — rolls to next year, so a seeded
 * trip always starts in the season its copy describes *and* stays in the
 * gallery long enough that the listing never dips below the nav gate right
 * after the seed runs. Public visibility drops a trip once its start date
 * passes, so "starts tomorrow" would be a one-day listing.
 */
export const SEED_MIN_DAYS_AHEAD = 30;

export function nextUtcMonthDay(baseDate: Date, month: number, day: number): Date {
  const midnight = startOfUtcDay(baseDate);
  const horizon = addUtcDays(midnight, SEED_MIN_DAYS_AHEAD);
  const year = midnight.getUTCFullYear();
  const sameYear = new Date(Date.UTC(year, month - 1, day));
  return sameYear.getTime() < horizon.getTime()
    ? new Date(Date.UTC(year + 1, month - 1, day))
    : sameYear;
}

export function buildSeedTrips(baseDate: Date = new Date()): BuiltSeedTrip[] {
  return SEED_TRIPS.map((trip) => {
    if (trip.startMonthDay === null) return { ...trip };
    const { month, day } = trip.startMonthDay;
    const startDate = nextUtcMonthDay(baseDate, month, day);
    const endDate = addUtcDays(startDate, trip.tripDetails.duration_days - 1);
    return { ...trip, startDate, endDate };
  });
}

/** Normalized exactly as the publish service will store them. */
export function seedTripTags(trip: SeedTrip): string[] {
  return normalizeGalleryTags(trip.tags);
}
