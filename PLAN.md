# QueueUP product plan

## First release

- Mobile-first live view for four starting courts.
- Signed-in players can see every court, join one queue, leave it, hop on when first in line, and hop off back to the end of the queue.
- Four players maximum can be marked on court. Capacity and queue order are enforced by the server.
- The first signed-in account becomes the initial admin. Admins can create courts, add walk-in players to a queue, and remove players from a court or queue.
- Shared database state refreshes automatically so separate phones see the same court status.

## Rules encoded in the MVP

1. A player may belong to one court at a time.
2. Joining always places the player at the back of the queue.
3. Only the first queued player can hop on, and only while fewer than four players are on court.
4. Hopping off releases a spot and returns the player to the back of that court's queue.
5. Leaving removes the player from both the court and its queue.

## Later decisions

- Decide whether players should be allowed to queue for several courts at once.
- Decide whether hopping off should leave the court completely instead of returning to the queue.
- Add admin promotion/removal, court renaming/deletion, and optional game/session history if operations require them.
