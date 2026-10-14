# STIB-MIVB

**Unofficial connector, not affiliated with STIB-MIVB.** It brings the
Brussels metros, trams and buses into Gladys through the STIB-MIVB open data
published on the [Belgian Mobility open data portal](https://data.belgianmobility.io/).
STIB-MIVB is a trademark of the Société des Transports Intercommunaux de
Bruxelles. Source of the data: STIB-MIVB – Open Data (CC BY 4.0).

## What you get

| Surface                                  | Content                                                                                                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One device per **watched stop platform** | minutes before the next metro, tram or bus, and for each of the next departures (3 by default): the countdown and a text line "92 → Schaerbeek Gare"; the STIB message of the stop ("Last departure") |
| The **STIB network** device              | the number of travellers information notices on the network and for your stops and lines, the main notice for your stops                                                                              |
| Scene triggers                           | **vehicle approaching** (1 to 15 minutes before arrival, optionally for one line), **last departure of the day**, **line disrupted** and **disruption cleared** (a notice published or withdrawn)     |
| Scene action                             | **next departures** of a stop (list, next line, destination, countdown, STIB message)                                                                                                                 |
| Dashboard widgets                        | **STIB departures** (one stop) and **STIB network** (the notices for your stops and lines, or the lines you choose)                                                                                   |

A STIB stop has one platform per direction (and per mode at the big stops):
`LOUISE` has the metro towards Simonis / Roi Baudouin (`8321`), the metro
towards Elisabeth (`8322`) and two tram platforms. Each platform is a device:
add the directions you use.

## Setup

1. Recommended: create a free account on the
   [Belgian Mobility developer portal](https://api-management-opendata-production.developer.azure-api.net/signup),
   subscribe to the free offer, and paste the primary key in **Subscription
   key**. Without a key, the portal allows 100 requests a day: the
   integration then reads the departures every 20 minutes only, which is too
   slow for the "vehicle approaching" trigger.
2. Install the integration. Every platform of the stops closest to your house
   (the house location of Gladys) is suggested in **Discovery**: add the ones
   you use.
3. To watch other stops, type them in **Stops to watch**, separated by
   commas: a name (`Louise` and `Louiza` both work) or a platform id
   (`3518B`). The **Search stops** button lists the platforms of a stop with
   their id and their lines.
4. Optional, per stop: a **line filter** after `@` keeps only these lines
   (`Louise@2|6`), and a **custom name** after `:` names the devices
   (`...:Metro to work`). Save, then open **Discovery** again and add the
   devices.
5. Put the **STIB departures** widget on a dashboard and pick a stop.

With a key, every watched stop is read every 30 seconds, all in one request
(option **Refresh interval**, 20 seconds at least), the notices every 5
minutes and the stop list once a day. Without a key: the departures every 20
minutes, the notices every 2 hours.

## Scenes

- **Vehicle approaching**: pick the stop, the number of minutes and,
  optionally, the line as STIB writes it (`92`, `T81`); the scene runs when a
  vehicle reaches the mark. Variables: the line, the destination, the minutes
  left, the expected time.
- **Last departure of the day**: STIB flags the last departure of a line at
  the stop; the scene runs once per line and direction.
- **Line disrupted** / **disruption cleared**: STIB published or withdrew a
  travellers information notice (disruption, works, diversion) for a line.
  Needs the STIB network device. Filter on a line, or on the notices about
  your stops and lines. Variables: the line, the notice, the lines concerned.

The action **next departures** gives `{{list}}` (one line per departure) and
`{{next_line}}`, `{{next_destination}}`, `{{next_minutes}}`, `{{message}}` for
a message or a condition.

## Troubleshooting

- **A stop is not found**: STIB names its stops in capitals, in French and
  Dutch; use **Search stops** with a part of the name.
- **"Without a subscription key"** in the status: add a key (step 1).
- **"Request quota exceeded"**: the anonymous quota is shared by everything
  that calls the portal without a key from your connection; add a key.
- **No departure announced** at night: STIB shows its own message instead
  ("Last departure", "End of service") in the message feature.
- Logs: the integration's log level is set with the `LOG_LEVEL` variable.

## Privacy

The integration sends the portal only the platform ids it reads, and the
subscription key in a header. The house location is used inside the
integration to pick the nearest stops and never leaves it.
