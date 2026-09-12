# LIFE RPG — AI Coach UI Update

This build updates the existing wp3 project.

Changes:
- Replaced AI coach avatar assets with the newly supplied female and male images.
- Redesigned AI Coach around the avatar, Today’s Briefing, Next Best Action, conversational chat, Coach Tools, and a compact Change Coach section.
- Removed the separate Coach Reaction button, Online indicator, large memory/debug panel, and standalone avatar roster from the AI Coach page.
- Added quick chat prompts and inline quest action cards.
- Moved Coach Memory & Privacy controls into Settings.
- Preserved the PostgreSQL/Express backend and existing RPG/Social/Inventory/Shop features.

Setup after extracting:
1. npm install
2. npm run server:install
3. Ensure server/.env exists (do not commit it)
4. npm run server:init
5. npm run server:dev
6. In another terminal: npm run dev
