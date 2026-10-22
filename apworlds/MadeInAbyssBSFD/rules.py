from __future__ import annotations

from typing import TYPE_CHECKING

from BaseClasses import CollectionState
from worlds.generic.Rules import add_rule, set_rule

if TYPE_CHECKING:
    from .world import MadeInAbyssBSFDWorld


def set_all_rules(world: MadeInAbyssBSFDWorld) -> None:
    # Note: Regions do not have rules, the Entrances connecting them do!
    # We'll do entrances first, then locations, and then finally we set our victory condition.

    set_all_entrance_rules(world)
    set_all_location_rules(world)
    set_completion_condition(world)


def set_all_entrance_rules(world: MadeInAbyssBSFDWorld) -> None:
    #Get entrances
    first_to_second_layer = world.get_entrance("1st Layer to 2nd Layer")
    second_to_third_layer = world.get_entrance("2nd Layer to 3rd Layer")
    third_to_fourth_layer = world.get_entrance("3rd Layer to 4th Layer")
    fourth_to_fifth_layer = world.get_entrance("4th Layer to 5th Layer")
    fifth_to_idoFrontInternal = world.get_entrance("5th Layer to Ido Front Internal")

    #Create Rules
    set_rule(first_to_second_layer, lambda state: state.has("Progressive Whistle", world.player, 1))
    set_rule(second_to_third_layer, lambda state: state.has("Progressive Whistle", world.player, 2))
    set_rule(third_to_fourth_layer, lambda state: state.has("Progressive Whistle", world.player, 3))
    set_rule(fourth_to_fifth_layer, lambda state: state.has("Progressive Whistle", world.player, 4))
    set_rule(fifth_to_idoFrontInternal, lambda state: state.has("Ido Front Key", world.player, 1))

    #This is how to create a general rule and apply it!
    #def has_blue_whistle(state: CollectionState) -> bool:
    #    return state.has("Progressive Whistle", world.player, 1)
    #set_rule(first_to_second_layer, has_blue_whistle)



def set_all_location_rules(world: MadeInAbyssBSFDWorld) -> None:
    # Location rules work no differently from Entrance rules.

    analyze_sakawatari = world.get_location("Analyze Sakawatari")
    set_rule(analyze_sakawatari, lambda state: state.has("Progressive Scope", world.player, 2))

    #Currently, most locations are tied to the ability to reach the first region in which they are found.


def set_completion_condition(world: MadeInAbyssBSFDWorld) -> None:
    # In our case, we went for the Victory event design pattern (see create_events() in locations.py).
    # So lets undo what we just did, and instead set the completion condition to:
    world.multiworld.completion_condition[world.player] = lambda state: state.has("Victory", world.player)
