from __future__ import annotations

from typing import TYPE_CHECKING

from BaseClasses import Item, ItemClassification

if TYPE_CHECKING:
    from .world import MadeInAbyssBSFDWorld

#Each item needs a unique Id
ITEM_NAME_TO_ID = {
    #Progressive Items
    "Ido Front Key": 10000,
    #4 whistles
    "Progressive Whistle": 4307,
    #2 Monocles
    "Progressive Scope": 4317,

    #Singles

    #Progressive item sets
    #9 Pickaxes, 8, hatchets, 6 guns, 6 bows
    "Progressive Pickax": 4397,
    "Progressive Hatchet": 4404,
    "Progressive Gun": 4382,
    "Progressive Bow": 4389,

    #15 Hats, 13 of the other equipment (it is only crafted equipment + Reg's hat and Ozen's Umbrella)
    "Progressive Hat": 3311,
    "Progressive Top": 3511,
    "Progressive Bottom": 3611,
    "Progressive Gloves": 3411,
    "Progressive Shoes": 3711,

    "Progressive Armor": 13311,

    #Future progression items? Like pitons and rope? ammo? Food?

    #Bundles
    "Poison Bundle": 14708,
    "Traversal Bundle": 14302,
    "Rare Traversal Bundle": 16110,
    "Exploration Bundle": 14371,
    
    "Meal Prep Bundle (Salt)": 14201,
    "Meal Prep Bundle (Miso)": 14202,
    "Meal Prep Bundle (Meat)": 13902,

    "Rare Meal Prep Bundle": 13907,
    "Fishing Bundle": 14323,
    "Rare Fishing Bundle": 14325,

    "Antidote Bundle": 14367,
    "Emergency Bundle": 14306,
    "Rare Emergency Bundle": 14303,

    "Quick Meal Bundle": 16322,
    "Meal Bundle (Hunger)": 16070,
    "Meal Bundle (Stamina)": 16060,
    "Meal Bundle (Exploration)": 16130,
    "Rare Meal Bundle": 16140,


    "Bullet Bundle": 13106,
    "Arrow Bundle": 13201,

    #Traps
    #Rock weight is a placeholder, real traps could be: Poison the player, take away satiety (Hunger), equipment scramble?
    "Rock Weight Trap": 14701,
}


#ItemClassification.trap is a thing I should consider using
#Classify items as progression, useful, filler, and traps
DEFAULT_ITEM_CLASSIFICATIONS = {
    #Important Items
    "Ido Front Key": ItemClassification.progression,
    "Progressive Whistle": ItemClassification.progression,
    "Progressive Scope": ItemClassification.progression | ItemClassification.useful,  # Items can have multiple classifications.

    #Equipment
    "Progressive Pickax": ItemClassification.useful,
    "Progressive Hatchet": ItemClassification.useful,
    "Progressive Gun": ItemClassification.useful,
    "Progressive Bow": ItemClassification.useful,
    "Progressive Hat": ItemClassification.useful,
    "Progressive Top": ItemClassification.useful,
    "Progressive Bottom": ItemClassification.useful,
    "Progressive Gloves": ItemClassification.useful,
    "Progressive Shoes": ItemClassification.useful,
    "Progressive Armor": ItemClassification.useful,

    #Filler Items
    "Poison Bundle": ItemClassification.filler,

    "Traversal Bundle": ItemClassification.filler,
    "Exploration Bundle": ItemClassification.filler,
    "Rare Traversal Bundle": ItemClassification.filler,
    
    "Meal Prep Bundle (Salt)": ItemClassification.filler,
    "Meal Prep Bundle (Miso)": ItemClassification.filler,
    "Meal Prep Bundle (Meat)": ItemClassification.filler,    
    "Rare Meal Prep Bundle": ItemClassification.filler,

    "Fishing Bundle": ItemClassification.filler,
    "Rare Fishing Bundle": ItemClassification.filler,

    "Antidote Bundle": ItemClassification.filler,
    "Emergency Bundle": ItemClassification.filler,
    "Rare Emergency Bundle": ItemClassification.filler,

    "Quick Meal Bundle": ItemClassification.filler,
    "Meal Bundle (Hunger)": ItemClassification.filler,
    "Meal Bundle (Stamina)": ItemClassification.filler,
    "Meal Bundle (Exploration)": ItemClassification.filler,
    "Rare Meal Bundle": ItemClassification.filler,

    "Bullet Bundle": ItemClassification.filler,
    "Arrow Bundle": ItemClassification.filler,

    #Traps
    "Rock Weight Trap": ItemClassification.trap,
}

FILLER_ITEMS = [
    "Poison Bundle",
    "Traversal Bundle",
    "Exploration Bundle",
    "Fishing Bundle",
    "Meal Prep Bundle (Salt)",
    "Meal Prep Bundle (Miso)",
    "Meal Prep Bundle (Meat)",
    "Antidote Bundle",
    "Emergency Bundle",
    "Quick Meal Bundle",
    "Meal Bundle (Hunger)",
    "Meal Bundle (Stamina)",
    "Meal Bundle (Exploration)",
    "Bullet Bundle",
    "Arrow Bundle",
]

RARE_FILLER_ITEMS = [
    "Rare Fishing Bundle",
    "Rare Meal Prep Bundle",
    "Rare Traversal Bundle",
    "Rare Emergency Bundle",
    "Rare Meal Bundle",
]

TRAP_ITEMS = [
    "Rock Weight Trap",
]


#Report the game
class MadeInAbyssBSFDItem(Item):
    game = "Made In Abyss BSFD"


#Get a random filler item
def get_random_filler_item_name(world: MadeInAbyssBSFDWorld) -> str:

    if world.random.randint(0, 99) < world.options.trap_chance:
        trapindex = 0 #world.random.randint(0, len(TRAP_ITEMS) - 1)
        return TRAP_ITEMS[trapindex]
    
    fillerindex = 0

    #25% chance for a filler item to be a rare filler item
    if world.random.randint(0, 99) < world.options.rare_bundle_chance:
        fillerindex = world.random.randint(0, len(RARE_FILLER_ITEMS) - 1)
        return RARE_FILLER_ITEMS[fillerindex]

    #world.random is required so that set seeds can be generated
    fillerindex = world.random.randint(0, len(FILLER_ITEMS) - 1)
    return FILLER_ITEMS[fillerindex]
    

#Get items with correct classification
#Note that the classification can be altered here if options were used
def create_item_with_correct_classification(world: MadeInAbyssBSFDWorld, name: str) -> MadeInAbyssBSFDItem:
    classification = DEFAULT_ITEM_CLASSIFICATIONS[name]

    return MadeInAbyssBSFDItem(name, classification, ITEM_NAME_TO_ID[name], world.player)


#Create and submit item pool
def create_all_items(world: MadeInAbyssBSFDWorld) -> None:
    #The number of items must exactly match the number of locations...

    itempool: list[Item] = [
        world.create_item("Ido Front Key"),
    ]

    #Important Items
    for _ in range(4):
        itempool.append(world.create_item("Progressive Whistle"))

    if world.options.extra_whistle:
        itempool.append(world.create_item("Progressive Whistle"))

    for _ in range(2):
        itempool.append(world.create_item("Progressive Scope"))

    #Equipment
    #weapons
    for _ in range(9):
        itempool.append(world.create_item("Progressive Pickax"))

    for _ in range(8):
        itempool.append(world.create_item("Progressive Hatchet"))

    for _ in range(6):
        itempool.append(world.create_item("Progressive Gun"))

    for _ in range(6):
        itempool.append(world.create_item("Progressive Bow"))

    #Armor
    if world.options.bundle_armor:
        for _ in range(13):
            itempool.append(world.create_item("Progressive Armor"))
    else:
        for _ in range(15):
            itempool.append(world.create_item("Progressive Hat"))

        for _ in range(13):
            itempool.append(world.create_item("Progressive Top"))

        for _ in range(13):
            itempool.append(world.create_item("Progressive Bottom"))

        for _ in range(13):
            itempool.append(world.create_item("Progressive Gloves"))

        for _ in range(13):
            itempool.append(world.create_item("Progressive Shoes"))


    #Get the length of the itempool
    number_of_items = len(itempool)

    #Get the number of unfilled locations
    number_of_unfilled_locations = len(world.multiworld.get_unfilled_locations(world.player))

    #Determine required filler count
    needed_number_of_filler_items = number_of_unfilled_locations - number_of_items

    #Fill Itempool
    itempool += [world.create_filler() for _ in range(needed_number_of_filler_items)]

    #Submit items to the multiworld
    world.multiworld.itempool += itempool

    #Check if the monocle should be given at the start
    if world.options.monocle_start:
        monocle_start = world.create_item("Progressive Scope")
        world.push_precollected(monocle_start)
