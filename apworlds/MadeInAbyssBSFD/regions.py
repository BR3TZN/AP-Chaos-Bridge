from __future__ import annotations

from typing import TYPE_CHECKING

from BaseClasses import Entrance, Region

if TYPE_CHECKING:
    from .world import MadeInAbyssBSFDWorld


# Here regions will be divided into three segments
#1: Actual in game maps. Actual entrance maps
#2: Layers of the Abyss. This could be for relics in the future.
#       This would be a one way so that it connects to nothing
#3: Imaginary regions that contain general checks like analyzing creatures
#       This would be a one way so that it connects to nothing

# For now, I am choosing to simplify this to just the layers and Orth
# It will need to be further split into regions for a map randomizer in the future
# I am thinking each entry point for each map will need to be a region
#   Connecting not only to its exit, but to the other sub regions in the map
#       Then only the exits from these subregions would be randomized
#           (Because they are the only real ones in-game)



def create_and_connect_regions(world: MadeInAbyssBSFDWorld) -> None:
    create_all_regions(world)
    connect_regions(world)


def create_all_regions(world: MadeInAbyssBSFDWorld) -> None:
    # Creating a region is as simple as calling the constructor of the Region class.
    orth = Region("Orth", world.player, world.multiworld)
    first_layer = Region("1st Layer", world.player, world.multiworld)
    second_layer = Region("2nd Layer", world.player, world.multiworld)
    third_layer = Region("3rd Layer", world.player, world.multiworld)
    fourth_layer = Region("4th Layer", world.player, world.multiworld)
    fifth_layer = Region("5th Layer", world.player, world.multiworld)
    ido_front_internal = Region("Ido Front Internal", world.player, world.multiworld)

    # Let's put all these regions in a list.
    regions = [orth, first_layer, second_layer, third_layer, fourth_layer, fifth_layer, ido_front_internal]
    #We can add to regions using regions.append(orth)


    # We now need to add these regions to multiworld.regions so that AP knows about their existence.
    world.multiworld.regions += regions


def connect_regions(world: MadeInAbyssBSFDWorld) -> None:
    #Get Regions
    orth = world.get_region("Orth")
    first_layer = world.get_region("1st Layer")
    second_layer = world.get_region("2nd Layer")
    third_layer = world.get_region("3rd Layer")
    fourth_layer = world.get_region("4th Layer")
    fifth_layer = world.get_region("5th Layer")
    ido_front_internal = world.get_region("Ido Front Internal")

    #Create entrances
    orth.connect(first_layer, "Orth to 1st Layer")
    first_layer.connect(second_layer, "1st Layer to 2nd Layer")
    second_layer.connect(third_layer, "2nd Layer to 3rd Layer")
    third_layer.connect(fourth_layer, "3rd Layer to 4th Layer")
    fourth_layer.connect(fifth_layer, "4th Layer to 5th Layer")
    fifth_layer.connect(ido_front_internal, "5th Layer to Ido Front Internal")

