# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.1.1] - 2026-10-14

### Added

- One device per watched stop platform (typed in the configuration, by name
  or platform id, with an optional line filter and custom name, or suggested
  from the stops closest to the house): next departure countdown, and per
  departure the countdown and a text line (line, destination), plus the STIB
  message of the stop (last departure, end of service).
- An "STIB network" device: travellers information notices on the network
  and for your stops and lines, and the main notice for your stops.
- Scene triggers "vehicle approaching" (1 to 15 minutes, optional line),
  "last departure of the day", "line disrupted" and "disruption cleared".
- Scene action "next departures".
- Dashboard widgets "STIB departures" and "STIB network".
- "Test STIB-MIVB" and "Search stops" buttons.
- Optional subscription key of the Belgian Mobility developer portal: real
  time (30 s by default); without it the integration stays within the
  anonymous quota (departures every 20 minutes).
- Stop and destination names in French or Dutch.

[Unreleased]: https://github.com/LM1LC3N7/gladys-stib/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-stib/releases/tag/v0.1.1
