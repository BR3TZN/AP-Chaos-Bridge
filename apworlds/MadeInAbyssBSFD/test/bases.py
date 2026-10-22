from test.bases import WorldTestBase

from ..world import MadeInAbyssBSFDWorld


class MadeInAbyssBSFDTestBase(WorldTestBase):
    game = "MadeInAbyssBSFD"
    world: MadeInAbyssBSFDWorld
