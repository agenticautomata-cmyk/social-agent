/**
 * Acceptance fixture for KCInsiders-style "The BIG LIST: Who's Opening, Where & When".
 * Business names appear only in fixtures — never hard-coded into production extractors.
 */
export const BIG_LIST_SUBJECT = "The BIG LIST: Who's Opening, Where & When";

export const BIG_LIST_FIXTURE_TEXT = `
The BIG LIST: Who's Opening, Where & When
By Joyce Smith · KCinsiders

Your roundup of Kansas City area restaurant and retail openings, soft openings, and coming-soon announcements.

1. Alice Scooper's Ice Cream Co.
   - 906 W. 39th St.
   - opening soon

2. Angry Chickz
   - 14995 W. 119th St., Olathe
   - November opening
   - other area locations pending

3. The Bad Cat
   - jazz bar
   - 1220 W. 103rd St.
   - planned opening September 25, 2026
   - previously announced in February 2024

4. Bam Bird Social
   - locally owned Mahjong event center
   - lessons and open play
   - 1512 N.W. Mock Ave., Suite C, Blue Springs
   - softly opened
   - grand opening October 3, 2026

5. Blurred Bar
   - Westport
   - 4149 Pennsylvania Ave.
   - izakaya-style bar
   - planned Halloween-weekend opening
   - former Le Champion space

6. Bojangles
   - 12005 Metcalf Ave., Overland Park
   - planned opening November 10, 2026

7. Boutique Collective — The Vine
   - Prairiefire
   - 5701 W. 135th St., Overland Park
   - opening soon
   - former Rock & Brews space

8. Charlie D's Seafood and Chicken
   - 1124 Oak St.
   - planned mid-October opening

9. Donutology
   - Crown Center
   - 2450 Grand Blvd., Suite 121
   - planned mid-October grand opening
   - relocation from its original Westport location

10. Fleet Feet
    - Brookside
    - 314 W. 63rd St., Suite B
    - planned early-November opening
`.trim();

export const BIG_LIST_EXPECTED_NAMES = [
  "Alice Scooper's Ice Cream Co.",
  'Angry Chickz',
  'The Bad Cat',
  'Bam Bird Social',
  'Blurred Bar',
  'Bojangles',
  'Boutique Collective',
  "Charlie D's Seafood and Chicken",
  'Donutology',
  'Fleet Feet',
] as const;

export const BIG_LIST_CANONICAL_URL =
  'https://kcinsiders.substack.com/p/the-big-list-whos-opening-where-and-when';
