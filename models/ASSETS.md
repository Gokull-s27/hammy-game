# Hammy Game – Asset Pack v1

All models: **1 unit = 1 game unit**, **Y up**, **front faces +Z**.
Floor objects have their origin at the **bottom centre**. Put every file in `models/`.

| File | What it is | Names the code can use |
|---|---|---|
| hamster.glb | Hamster, real size (0.6 long). Rigged with simple parts. | Animations: `idle`, `walk`, `eat`. Parts: `body`, `head`, `ear_L/R`, `leg_FL/FR/BL/BR`. Materials to recolour: `fur_main`, `fur_belly`, `skin_pink`, `eyes` |
| cage_base.glb | Tray, 4 × 3 | Snap points: `socket_left`, `socket_right`, `socket_front`, `socket_back` |
| cage_walls_clear.glb | Clear plastic walls with tube holes | `walls`, `tube_holes` |
| cage_bars.glb | Wire bar walls with tube holes | `bars`, `tube_holes` |
| bedding.glb | Floor bedding with wood shavings | `bedding_base`, `shavings` |
| food_bowl.glb | Bowl with 5 food pieces | `food_1` … `food_5` (hide one per bite) |
| water_bottle.glb | Bottle on a stand | `water_level` (scale Y from 1 down to 0), `nozzle` |
| wheel.glb | Exercise wheel | `wheel_spin` (rotate X), `wheel_stand` |
| house.glb | Hamster hut with a door | `entrance` (point in front of the door) |
| ramp.glb | Ramp, 0.5 high, 1.0 long | `bottom_end`, `top_end` |
| platform.glb | Platform, 0.5 high, 1 × 1 | `top_surface` |
| bridge.glb | Arched bridge, 1.5 long | `end_left`, `end_right` |
| swing.glb | Swing | `swing_seat` (rotate X to swing), `swing_frame` |
| chew_toy.glb | Wooden chew ball (push it around) | `chew_ball` |
| hanging_chew.glb | Hanging chew blocks | `chew_hang` (rotate X/Z to sway), `chew_hook` |
| tube_straight_short.glb | Tube, 0.5 long | `socket_1`, `socket_2` |
| tube_straight_long.glb | Tube, 1.0 long | `socket_1`, `socket_2` |
| tube_corner.glb | 90° turn (flat) | `socket_1`, `socket_2` |
| tube_bend_up.glb | Turns from flat to going up | `socket_1`, `socket_2` |
| tube_t.glb | T junction | `socket_1`, `socket_2`, `socket_3` |
| tube_connector.glb | Collar joining a tube to a cage hole | `socket_1`, `socket_2` |
| tube_endcap.glb | Closes a tube end | `socket_1` |

**Sockets** are empty points. Their local +Z arrow points out of the opening, so two
pieces connect when their sockets touch and point in opposite directions.

**Tubes** have their origin on the tube's centre line (they float), radius 0.3.
Cage tube holes are at height 0.35.

These are placeholder art made in code. Import any file into Blender
(File → Import → glTF 2.0) to repaint, reshape or replace it, keeping the same
object names so the game code still works.
