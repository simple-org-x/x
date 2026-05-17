package config_test

import "os"

func lookup(k string) (string, bool) { return os.LookupEnv(k) }
func setenv(k, v string) error       { return os.Setenv(k, v) }
func unset(k string) error           { return os.Unsetenv(k) }
