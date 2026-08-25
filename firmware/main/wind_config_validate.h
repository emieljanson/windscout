#pragma once

#ifndef WIND_PROVIDER_DEVELOPMENT_MODE
#error "WIND_PROVIDER_DEVELOPMENT_MODE must be defined before validating wind configuration"
#endif

#ifndef WIND_PROVIDER_COMMERCIAL_MODE
#error "WIND_PROVIDER_COMMERCIAL_MODE must be defined before validating wind configuration"
#endif

#ifndef WIND_PROVIDER_ENDPOINT_KIND
#error "WIND_PROVIDER_ENDPOINT_KIND must be defined before validating wind configuration"
#endif

#if WIND_PROVIDER_DEVELOPMENT_MODE && WIND_PROVIDER_COMMERCIAL_MODE
#error "Wind provider development and commercial modes are mutually exclusive"
#endif

#if WIND_PROVIDER_COMMERCIAL_MODE &&                                                   \
    WIND_PROVIDER_ENDPOINT_KIND != WIND_PROVIDER_ENDPOINT_KIND_LICENSED
#error "Commercial wind builds require an explicitly licensed endpoint profile"
#endif
