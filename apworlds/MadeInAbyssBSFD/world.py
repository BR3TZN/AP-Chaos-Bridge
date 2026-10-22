from collections.abc import Mapping
from typing import Any


from worlds.AutoWorld import World

from . import items, locations, regions, rules, web_world
from . import options as MadeInAbyssBSFD_options


class MadeInAbyssBSFDWorld(World):
    """
    Made in Abyss Binary Star Falling into Darkness is an action exploration game
    based on the anime "Made in Abyss". It is about children yearning for the mines XD
    """


    # You must override the "game" field to say the name of the game.
    game = "MadeInAbyssBSFD"

    #Set webworld... I don't think this really matters since this game will never be on the website (M 17+ rating)
    web = web_world.MadeInAbyssBSFDWebWorld()

    #Add options
    options_dataclass = MadeInAbyssBSFD_options.MadeInAbyssBSFDOptions
    options: MadeInAbyssBSFD_options.MadeInAbyssBSFDOptions  # Common mistake: This has to be a colon (:), not an equals sign (=).

    #Get data from other classes
    location_name_to_id = locations.LOCATION_NAME_TO_ID
    item_name_to_id = items.ITEM_NAME_TO_ID

    #Start in Orth
    origin_region_name = "Orth"

    #Create our regions
    def create_regions(self) -> None:
        regions.create_and_connect_regions(self)
        locations.create_all_locations(self)

    #Set the world rules
    def set_rules(self) -> None:
        rules.set_all_rules(self)

    #Create all our items
    def create_items(self) -> None:
        items.create_all_items(self)

    #Create an individual item
    def create_item(self, name: str) -> items.MadeInAbyssBSFDItem:
        return items.create_item_with_correct_classification(self, name)

    #This is for creating extra filler items that the multiworld generator might need
    def get_filler_item_name(self) -> str:
        return items.get_random_filler_item_name(self)

    # There may be data that the game client will need to modify the behavior of the game.
    # This is what slot_data exists for. Upon every client connection, the slot's slot_data is sent to the client.
    # slot_data is just a dictionary using basic types, that will be converted to json when sent to the client.
    def fill_slot_data(self) -> Mapping[str, Any]:
        # If you need access to the player's chosen options on the client side, there is a helper for that.
        return self.options.as_dict(
            "monocle_start"
        )
