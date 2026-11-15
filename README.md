# Life Log for Obsidian

A dashboard for the people, pets, schools, jobs, homes and milestones in your life. It has a banner for each tab, photo galleries and connections between entries.

Every entry is an ordinary Markdown note, and every photo is an ordinary file in your vault. If you stop using the plugin, your data is still there and still readable.

## Features

- **One dashboard tab** with Overview, People, Pets, Education, Work, Homes, Milestones and Guide tabs.
- **A banner for each tab.** The People tab can show a different image from the Pets tab. Tabs without their own banner use the Overview banner.
- **Picture cards.** Each card shows a cover photo and a name. Click a card to see the full entry.
- **Photo galleries.** Upload photos from your device or choose images already in your vault, then view them full size with arrow-key navigation.
- **Connections between entries,** with labels such as *Mother*, *Brother*, *Spouse*, *Lived here* or *Coworker*. They show on both entries, and family labels reverse automatically: if Elliot lists Ana as *Mother*, Ana's page shows Elliot as *Child*. Connections are real Obsidian links, so they appear in backlinks and the graph view, and they update when a note is renamed.
- **A timeline** of when you met people, got pets, started schools and jobs, and moved homes, plus births, deaths and Rainbow Bridge dates.
- **Ages worked out automatically** from birthdays, including age at death.
- **Embeddable sections:** you can put the timeline, summary, pets or cards inside any note.

### Fields

| Tab | Fields |
| --- | --- |
| People | Relation to you, alias / nicknames, occupation, birthday, age, date of death, met, where you met, connections, notes |
| Pets | Species / breed, alias / nicknames, birthday (if known), age, joined the family, Rainbow Bridge, came from, connections, notes |
| Education | Level / degree, major, minor, location, started, finished, connections, notes |
| Work | Role, location, started, left, connections, notes |
| Homes | Type of home, city / region, moved in, moved out, connections, notes |
| Milestones | Type, where, date, connections, notes |

Every entry also has a cover image, a gallery and tags.

## Install with BRAT (beta)

1. Install **BRAT** from *Settings → Community plugins → Browse* and enable it.
2. Open *Settings → BRAT → Add Beta plugin*.
3. Enter `bearbaitdesigns/obsidian_lifelog` and click **Add Plugin**.
4. Enable **Life Log** in *Settings → Community plugins*.

BRAT checks for updates automatically.

### Manual install

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/bearbaitdesigns/obsidian_lifelog/releases/latest). Put them in `<your vault>/.obsidian/plugins/life-log/`, then enable **Life Log** in *Settings → Community plugins*.

## Using it

- The dashboard opens by itself the first time you enable the plugin. After that, click the **book** icon in the ribbon, or run **Life Log: Open dashboard** from the command palette.
- On an empty vault, the Overview shows a welcome panel. **Add example entries** (also available as the command **Life Log: Add example entries**) fills the dashboard with a small connected family, pets, a school, a job and homes. They're tagged `#lifelog-example` so you can find and delete them later.
- Add entries with **+ New entry**, the **+** card on any tab, or commands such as **Life Log: New person**.
- To set a banner, open a tab and click the image button on the banner. The reset button removes that tab's banner.
- Click your name or the line under it on the Overview banner to edit them.

### Where your data lives

New entries are created in `Life Log/<Category>/`, and uploaded images go to `Life Log/_images/`. You can change both folders in the plugin settings. Any note in your vault with a `lifelog` property is included, wherever it is.

```markdown
---
lifelog: people
relation: Brother
aliases: [Eli, El]
occupation: Paramedic
birthday: 1995-02-03
cover: "[[elliot-ashdown.jpg]]"
gallery:
  - "[[elliot-ashdown-2.jpg]]"
connections:
  - "[[Ana Ashdown|Mother]]"
  - "[[The Halden House|Lived here]]"
tags: [family]
---
Notes go here, in normal Markdown.
```

`lifelog` can be `people`, `pets`, `education`, `work`, `homes` or `milestones`. Each connection is a link whose display text is the relationship label.

### Embedding in a note

````markdown
```lifelog
view: timeline     # timeline | summary | pets | cards
category: people   # needed for view: cards
limit: 10          # optional
```
````

## Releasing a new version

1. Run `node scripts/bump-version.mjs 1.0.1` to update `manifest.json` and `versions.json`, then commit and push.
2. Start the **Release** GitHub Action in any of these ways:
   - **Actions → Release → Run workflow.** This releases the version in `manifest.json` and creates the tag for you.
   - Push a tag that matches the version exactly, with no `v` prefix: `git tag 1.0.1 && git push origin 1.0.1`.
   - Publish a release from the GitHub website with a matching tag.
3. The Action checks that the version matches `manifest.json` and `versions.json`, then publishes a release with `main.js`, `manifest.json` and `styles.css`. BRAT picks it up from there.

A version with a hyphen, such as `1.1.0-beta.1`, is published as a pre-release.

## License

MIT © bearbaitdesigns
