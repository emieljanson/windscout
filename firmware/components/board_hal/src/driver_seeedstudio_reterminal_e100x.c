// E1001 and E1002 share the carrier peripherals and pinout. The implementation
// below contains no panel-selection policy; on this target its epaper calls go
// through the runtime dispatcher.
#include "driver_seeedstudio_reterminal_e1002.c"
