from __future__ import annotations

from typing import TYPE_CHECKING

from BaseClasses import ItemClassification, Location

from . import items

if TYPE_CHECKING:
    from .world import MadeInAbyssBSFDWorld

# Every location must have a unique integer ID (>0) associated with it, it need not be sequential

# Naming and indexing conventions
# Analyzing creature checks will have the ID match their in-game Id
# Analyzing creatue checks will follow the english creature name proceeded by Analyze
#   Ex: Neritantans are third layer creatures with an Id of 1010 so the format would be
#       "Analyze Neritantan": 1010


LOCATION_NAME_TO_ID = {   
    #Map Exploration Locations
    #The id is the map Id
    #First Layer
    "Discover Netherworld Gate": 1,
    "Discover Tree/Fossil Abode": 2,
    "Discover Grand Bridge Way": 3,
    "Discover Waterfall Gondola": 4,
    "Discover Twin Falls": 5,
    "Discover Wind-Riding Windmill": 6,
    "Discover Stone Ark": 7,
    "Discover Jumping Rock": 8,
    "Discover Multilayer Hill": 9,

    #Second Layer
    "Discover Forest of Temptation": 10,
    "Discover Corpse-Weeper Den": 11,
    "Discover Inverted Forest": 12,
    "Discover Hell's Crossing": 13,
    "Discover Inverted Arbor": 14,
    "Discover Seeker Camp": 15,
    #"Seeker Camp Internal": 16,
    "Discover Terminal Pond": 17,
    "Discover Edge of the Abyss": 18,
    "Discover Heaven's Waterfall": 19,
    "Discover Updraft Wasteland": 20,

    #Third Layer
    "Discover The Great Fault": 21,
    "Discover Trapped Pirate Ship": 22,
    "Discover Hexagon Pillars": 23,
    "Discover Cold Heat Layer": 24,
    "Discover Quadruple Pit": 25,
    "Discover Glass Layer": 26,
    #"Spiral Hole (Upper)": 27, Unused location I think?
    "Discover Rock Slide Hall": 28,
    "Discover Freezing Hot Mines": 29,

    #Fourth Layer
    "Discover Goblets of Giants": 30,
    "Discover Nanachi's Hideout": 31,
    "Discover Hidden Hot Spring": 32,
    "Discover Giant Vine Bridge": 33,
    "Discover Floating Rocks": 34,
    "Discover Crystal Valley": 35,
    #"Spiral Hole (Lower)": 36, Unused location I think?
    "Discover Eternal Fortunes": 37,
    "Discover Deep Tree Remains": 38,

    #Fifth Layer
    "Discover Sea of Corpses 1": 39,
    "Discover Sea of Corpses 2": 40,
    "Discover Hail Jail": 41,
    "Discover Water Crystals 1": 42,
    "Discover Water Crystals 2": 43,
    "Discover Eternal Garden": 44,
    "Discover Ido Front Area": 45,
    "Discover Sandy Ice Area 1": 46,
    "Discover Sandy Ice Area 2": 47,
    "Discover Ido Front": 48,
    "Discover Ido Front Internal": 49,
    "Discover The Altar": 50,

    #Quest Completion Locations
    #The Id is the quest Id + 100

    #First Layer Quests
    "Cave Raid Readiness": 130,
    "Into the Abyss": 131,
    "Netherworld Gate Raid": 132,
    "Sad Report": 133,
    "Unexplored Area": 134,
    "Escape Unexplored Area 1": 135,
    "Escape Unexplored Area 2": 136,
    "Escape Unexplored Area 3": 137,
    "First Layer Investigation": 138,
    "Material Group Search": 139,
    "Town Quest": 140,
    "Search for Tiare": 141,
    "Blue Whistle Trial": 142,
    "The Visitor's Quest": 154,
    "Antidote Search": 155,
    "Orphanage Anniversary": 173,
    "Nat's Request": 175,
    "Second Checkpoint": 176,
    "Third Checkpoint": 177,

    #Second Layer Quests
    "Second Layer": 144,
    "Second Layer Investigation": 145,
    "Moon Whistle Trial": 147,
    "To the Seeker Camp": 233,


    #Third Layer Quests
    "Third Layer Investigation": 148,

    #Fourth Layer Quests
    "Fourth Layer Investigation": 149,
    "Black Whistle Trial": 150,

    #5th Layer Quests
    "Fifth Layer Investigation": 151,
    "Head to Ido Front": 152,
    "Bondrewds Quest": 204,

    #Creature Scanning Locations
    #The Id is the creature Id
    "Analyze Neritantan": 1010,
    "Analyze Tachikanata": 1020,
    "Analyze Tachikanata (Azure)": 1021,
    "Analyze Tachikanata (Ancestor)": 1022,

    # Amakagame is recorded in the notebook by killing it. I haven't found the method to check for this
    # "Analyze Amakagame": 1030,

    "Analyze Hornicrier": 1040,
    "Analyze Hornicrier (Ancestor)": 1041,
    "Analyze Hornicrier (Subspecies)": 1042,
    "Analyze Hammerbeak": 1050,
    "Analyze Silkfang": 1070,
    "Analyze Inbyo": 1080,
    "Analyze Ottobas": 1090,
    "Analyze Corpse-weeper": 1100,
    "Analyze Crimson Splitjaw": 1110,
    "Analyze Madokajack": 1120,
    "Analyze Amaranthine-deceptor": 1130,
    "Analyze Orb Piercer": 1140,
    "Analyze Stingerhead": 1150,
    "Analyze Giant Hammerbeak": 1160,
    "Analyze Sakawatari": 1170,
    "Analyze Man-toyer": 1180,
    "Analyze Valley Croaker": 1190,
    "Analyze Valley Croaker (Jumper)": 1191,
    "Analyze Valley Croaker (Extreme)": 1192,
    "Analyze Pupa-carrier": 1200,
    "Analyze Pupa-carrier (Rare)": 1201,
    "Analyze Strength Sucker": 1202,
    "Analyze Stinger": 1210,
    "Analyze Stinger (Ancestor)": 1211,
    "Analyze Stinger (Subspecies)": 1212,
    "Analyze Yomotsubi": 1220,
    "Analyze Yomotsubi (Ancestor)": 1221,
    "Analyze Yomotsubi (Rare)": 1222,
    "Analyze Rock-licker": 1230,
    "Analyze Rock-walker": 1240,
    "Analyze Man-toyer (Rare)": 1250,
    "Analyze Head-tail": 1260,
    "Analyze Head-tail (Subspecies)": 1261,
    "Analyze Kudara": 1270,
    "Analyze Kudara (Shadow)": 1271,
    "Analyze Mountain-spinner": 1280,
    "Analyze Mountain-spinner (Fire)": 1281,
    "Analyze Mountain-spinner (Ice)": 1282,
    "Analyze Light-eater": 1290,
    "Analyze Footing-slicer": 1300,
    "Analyze Tidal-freezer": 1310,
    "Analyze Ink Flower": 1320,
    "Analyze End-jumper": 1330,
    "Analyze Octoliar": 1340,
    "Analyze Spikewalker": 1350,
    "Analyze Vine-stopper": 1370,
    "Analyze Akatsutsuso": 1380,
    "Analyze Aotsutsuso": 1390,
    "Analyze Vine-binder": 1400,
    "Analyze Vine-binder (Subspecies)": 1410,
    "Analyze Vine-blaster (Green)": 1420,
    "Analyze Vine-blaster (Blue)": 1421,
    "Analyze Vine-blaster (Red)": 1422,
    "Analyze Swarm-shocker (Blue)": 1430,
    "Analyze Swarm-shocker (Purple)": 1440,
    "Analyze Swarm-shocker (Orange)": 1450,
    "Analyze Shroombear": 1530,

    # Interference devices are 1-time encounters
    # They can be analyzed, but they are also recorded on death
    # I have not hooked the method to record this event
    # "Analyze 1st Layer Inter. Device": 1600,
    # "Analyze 2nd Layer Inter. Device": 1610,
    # "Analyze 3rd Layer Inter. Device": 1620,
    # "Analyze 4th Layer Inter. Device": 1630,
    # "Analyze 5th Layer Inter. Device": 1640,

    "Analyze Gankimasu": 2010,
    "Analyze Ikenosuke": 2040,
    "Analyze Tenkoume": 2070,
    "Analyze Hamashirama": 2100,
    "Analyze Hagamizukin": 2110,
    "Analyze Tachikanata (Young)": 2120,
    "Analyze Footing-slicer (Young)": 2140,
    "Analyze Ink Flower (Young)": 2150,
}


# Each Location instance must correctly report the "game" it belongs to.
# To make this simple, it is common practice to subclass the basic Location class and override the "game" field.
class MadeInAbyssBSFDLocation(Location):
    game = "MadeInAbyssBSFD"



# Note: There is a minor typing quirk here. Some functions want location addresses to be an "int | None",
# so while our function here only ever returns dict[str, int], we annotate it as dict[str, int | None].
def get_location_names_with_ids(location_names: list[str]) -> dict[str, int | None]:
    return {location_name: LOCATION_NAME_TO_ID[location_name] for location_name in location_names}


def create_all_locations(world: MadeInAbyssBSFDWorld) -> None:
    create_regular_locations(world)
    create_events(world)


def create_regular_locations(world: MadeInAbyssBSFDWorld) -> None:
    #Get all regions
    orth = world.get_region("Orth")
    first_layer = world.get_region("1st Layer")
    second_layer = world.get_region("2nd Layer")
    third_layer = world.get_region("3rd Layer")
    fourth_layer = world.get_region("4th Layer")
    fifth_layer = world.get_region("5th Layer")


    #Assign checks to regions
    first_layer_analyze_locations = get_location_names_with_ids(
        ["Analyze Tachikanata", 
         "Analyze Hammerbeak", 
         "Analyze Hornicrier", 
         "Analyze Silkfang",
         "Analyze Crimson Splitjaw",
         "Analyze Sakawatari",
         "Analyze Man-toyer",
         "Analyze Strength Sucker",
         "Analyze Stinger",
         "Analyze Vine-stopper",
         "Analyze Vine-binder",
         "Analyze Vine-binder (Subspecies)",
         "Analyze Gankimasu",
         "Analyze Tachikanata (Young)"
         ]
    )

    first_layer_discover_locations = get_location_names_with_ids(
        ["Discover Netherworld Gate",
         "Discover Tree/Fossil Abode",
         "Discover Grand Bridge Way",
         "Discover Waterfall Gondola",
         "Discover Twin Falls",
         "Discover Wind-Riding Windmill",
         "Discover Stone Ark",
         "Discover Jumping Rock",
         "Discover Multilayer Hill",
         ]
    )

    first_layer_quest_locations = get_location_names_with_ids(
        ["Cave Raid Readiness",
         "Into the Abyss",
         "Netherworld Gate Raid",
         "Sad Report",
         "Unexplored Area",
         "Escape Unexplored Area 1",
         "Escape Unexplored Area 2",
         "Escape Unexplored Area 3",
         "First Layer Investigation",
         "Material Group Search",
         "Town Quest",
         "Search for Tiare",
         "Blue Whistle Trial",
         "The Visitor's Quest",
         "Antidote Search",
         "Orphanage Anniversary",
         "Nat's Request",
         "Second Checkpoint",
         "Third Checkpoint",
         ]
    )    

    second_layer_analyze_locations = get_location_names_with_ids(
        ["Analyze Tachikanata (Azure)", 
         "Analyze Hornicrier (Ancestor)", 
         "Analyze Inbyo", 
         "Analyze Ottobas",
         "Analyze Corpse-weeper",
         "Analyze Giant Hammerbeak",
         "Analyze Valley Croaker",
         "Analyze Valley Croaker (Jumper)",
         "Analyze Valley Croaker (Extreme)",
         "Analyze Pupa-carrier",
         "Analyze Stinger (Ancestor)",
         "Analyze Yomotsubi",
         "Analyze Spikewalker",
         "Analyze Akatsutsuso",
         "Analyze Aotsutsuso",
         "Analyze Vine-blaster (Green)",
         "Analyze Vine-blaster (Blue)",
         "Analyze Ikenosuke"
         ]
    )

    second_layer_discover_locations = get_location_names_with_ids(
        ["Discover Forest of Temptation",
         "Discover Corpse-Weeper Den",
         "Discover Inverted Forest",
         "Discover Hell's Crossing",
         "Discover Inverted Arbor",
         "Discover Seeker Camp",
         "Discover Terminal Pond",
         "Discover Edge of the Abyss",
         "Discover Heaven's Waterfall",
         "Discover Updraft Wasteland",
         ]
    )

    second_layer_quest_locations = get_location_names_with_ids(
        ["Second Layer",
         "Second Layer Investigation",
         "Moon Whistle Trial",
         "To the Seeker Camp",
         ]
    )    

    third_layer_analyze_locations = get_location_names_with_ids(
        ["Analyze Neritantan", 
         "Analyze Tachikanata (Ancestor)", 
         "Analyze Madokajack",
         "Analyze Yomotsubi (Ancestor)",
         "Analyze Rock-licker",
         "Analyze Rock-walker",
         "Analyze Mountain-spinner",
         "Analyze Mountain-spinner (Fire)",
         "Analyze Mountain-spinner (Ice)",
         "Analyze End-jumper",
         "Analyze Tenkoume"
         ]
    )

    third_layer_discover_locations = get_location_names_with_ids(
        ["Discover The Great Fault",
         "Discover Trapped Pirate Ship",
         "Discover Hexagon Pillars",
         "Discover Cold Heat Layer",
         "Discover Quadruple Pit",
         "Discover Glass Layer",
         "Discover Rock Slide Hall",
         "Discover Freezing Hot Mines",
         ]
    )

    third_layer_quest_locations = get_location_names_with_ids(
        ["Third Layer Investigation",
         ]
    )
    

    fourth_layer_analyze_locations = get_location_names_with_ids(
        ["Analyze Hornicrier (Subspecies)", 
         "Analyze Amaranthine-deceptor",
         "Analyze Orb Piercer",
         "Analyze Pupa-carrier (Rare)",
         "Analyze Stinger (Subspecies)",
         "Analyze Yomotsubi (Rare)",
         "Analyze Man-toyer (Rare)",
         "Analyze Head-tail",
         "Analyze Kudara",
         "Analyze Light-eater",
         "Analyze Vine-blaster (Red)",
         "Analyze Shroombear",
         "Analyze Hagamizukin",
         "Analyze Footing-slicer (Young)"
         ]
    )

    fourth_layer_discover_locations = get_location_names_with_ids(
        ["Discover Goblets of Giants",
         "Discover Nanachi's Hideout",
         "Discover Hidden Hot Spring",
         "Discover Giant Vine Bridge",
         "Discover Floating Rocks",
         "Discover Crystal Valley",
         "Discover Eternal Fortunes",
         "Discover Deep Tree Remains",
         ]
    )

    fourth_layer_quest_locations = get_location_names_with_ids(
        ["Fourth Layer Investigation",
         "Black Whistle Trial",
         ]
    )   

    fifth_layer_analyze_locations = get_location_names_with_ids(
        ["Analyze Stingerhead", 
         "Analyze Head-tail (Subspecies)",
         "Analyze Kudara (Shadow)",
         "Analyze Footing-slicer",
         "Analyze Tidal-freezer",
         "Analyze Ink Flower",
         "Analyze Octoliar",
         "Analyze Swarm-shocker (Blue)",
         "Analyze Swarm-shocker (Purple)",
         "Analyze Swarm-shocker (Orange)",
         "Analyze Hamashirama",
         "Analyze Ink Flower (Young)"
         ]
    )

    fifth_layer_discover_locations = get_location_names_with_ids(
        ["Discover Sea of Corpses 1",
         "Discover Sea of Corpses 2",
         "Discover Hail Jail",
         "Discover Water Crystals 1",
         "Discover Water Crystals 2",
         "Discover Eternal Garden",
         "Discover Ido Front Area",
         "Discover Sandy Ice Area 1",
         "Discover Sandy Ice Area 2",
         "Discover Ido Front",
         "Discover Ido Front Internal",
         "Discover The Altar",
         ]
    )

    fifth_layer_quest_locations = get_location_names_with_ids(
        ["Fifth Layer Investigation",
         "Head to Ido Front",
         "Bondrewds Quest",
         ]
    )

    #Add locations to the list
    first_layer.add_locations(first_layer_analyze_locations, MadeInAbyssBSFDLocation)
    first_layer.add_locations(first_layer_discover_locations, MadeInAbyssBSFDLocation)
    first_layer.add_locations(first_layer_quest_locations, MadeInAbyssBSFDLocation)

    second_layer.add_locations(second_layer_analyze_locations, MadeInAbyssBSFDLocation)
    second_layer.add_locations(second_layer_discover_locations, MadeInAbyssBSFDLocation)
    second_layer.add_locations(second_layer_quest_locations, MadeInAbyssBSFDLocation)

    third_layer.add_locations(third_layer_analyze_locations, MadeInAbyssBSFDLocation)
    third_layer.add_locations(third_layer_discover_locations, MadeInAbyssBSFDLocation)
    third_layer.add_locations(third_layer_quest_locations, MadeInAbyssBSFDLocation)

    fourth_layer.add_locations(fourth_layer_analyze_locations, MadeInAbyssBSFDLocation)
    fourth_layer.add_locations(fourth_layer_discover_locations, MadeInAbyssBSFDLocation)
    fourth_layer.add_locations(fourth_layer_quest_locations, MadeInAbyssBSFDLocation)

    fifth_layer.add_locations(fifth_layer_analyze_locations, MadeInAbyssBSFDLocation)
    fifth_layer.add_locations(fifth_layer_discover_locations, MadeInAbyssBSFDLocation)
    fifth_layer.add_locations(fifth_layer_quest_locations, MadeInAbyssBSFDLocation)


def create_events(world: MadeInAbyssBSFDWorld) -> None:

    #Get Regions
    ido_front_internal = world.get_region("Ido Front Internal")

    #Set the victory flag in Ido Front Internal.
    ido_front_internal.add_event(
        "Descended to 6th Layer", "Victory", location_type=MadeInAbyssBSFDLocation, item_type=items.MadeInAbyssBSFDItem
    )

