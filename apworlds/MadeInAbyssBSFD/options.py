from dataclasses import dataclass

from Options import Choice, OptionGroup, PerGameCommonOptions, Range, Toggle, DefaultOnToggle


class ExtraWhistle(Toggle):
    """
    Choose to include an extra whistle into the item pool.
    White whistle is still the max rank, this just makes it easier to clear.
    """

    display_name = "Extra Whistle"

#Defualt to start with the monocle for an accelerated start
class MonocleStart(DefaultOnToggle):
    """
    Choose to start with a monocle.
    This accelerates the start so you can start getting analysis checks right away.
    """

    display_name = "Start with Monocle"

class BundleArmor(Toggle):
    """
    Choose to bundle armor sets together.
    """

    display_name = "Bundle armor sets"


class RareBundleChance(Range):
    """
    Percentage chance for filler items to be replaced with better versions
    """

    display_name = "Rare Bundle Chance"

    range_start = 0
    range_end = 100
    default = 10


class TrapChance(Range):
    """
    Percentage chance for unimportant items to be replaced with traps
    """

    display_name = "Trap Chance"

    range_start = 0
    range_end = 100
    default = 5

# This is in the format "option_name_in_snake_case: OptionClassName".
@dataclass
class MadeInAbyssBSFDOptions(PerGameCommonOptions):
    extra_whistle: ExtraWhistle
    monocle_start: MonocleStart
    bundle_armor: BundleArmor
    rare_bundle_chance: RareBundleChance
    trap_chance: TrapChance
    
    


# If we want to group our options by similar type, we can do so as well. This looks nice on the website.
# If we want to group our options by similar type, we can do so as well. This looks nice on the website.
option_groups = [
    OptionGroup(
        "Gameplay Options",
        [MonocleStart, TrapChance], 
    ),
]

#Define option presets. I don't need this for now, but maybe later...
option_presets = {
    "Ready to Analyze": {
        "monocle_start": True,
        "trap_chance": 5
    },
}
