function(compile_config_case case_name expected_success development_mode commercial_mode endpoint_kind)
  set(source "${TEST_BINARY_DIR}/${case_name}.c")
  set(object "${TEST_BINARY_DIR}/${case_name}.o")
  file(WRITE "${source}"
    "#define WIND_PROVIDER_ENDPOINT_KIND_UNSPECIFIED 0\n"
    "#define WIND_PROVIDER_ENDPOINT_KIND_FREE 1\n"
    "#define WIND_PROVIDER_ENDPOINT_KIND_LICENSED 2\n"
    "#define WIND_PROVIDER_DEVELOPMENT_MODE ${development_mode}\n"
    "#define WIND_PROVIDER_COMMERCIAL_MODE ${commercial_mode}\n"
    "#define WIND_PROVIDER_ENDPOINT_KIND ${endpoint_kind}\n"
    "#include \"wind_config_validate.h\"\n"
    "int main(void) { return 0; }\n")
  execute_process(
    COMMAND "${TEST_C_COMPILER}" -I "${WIND_CONFIG_INCLUDE_DIR}" -c "${source}" -o "${object}"
    RESULT_VARIABLE result
    OUTPUT_QUIET
    ERROR_QUIET
  )
  if(expected_success AND NOT result EQUAL 0)
    message(FATAL_ERROR "${case_name} should compile but failed")
  endif()
  if(NOT expected_success AND result EQUAL 0)
    message(FATAL_ERROR "${case_name} should fail compilation but succeeded")
  endif()
endfunction()

file(MAKE_DIRECTORY "${TEST_BINARY_DIR}")
compile_config_case(development_free TRUE 1 0 1)
compile_config_case(commercial_licensed TRUE 0 1 2)
compile_config_case(commercial_free FALSE 0 1 1)
compile_config_case(commercial_unspecified FALSE 0 1 0)
compile_config_case(mixed_modes FALSE 1 1 2)
