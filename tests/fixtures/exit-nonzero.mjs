// Tiny fixture: exits with a non-zero code. Used by handlers.test.ts to
// exercise the exec handler's failure path without depending on platform
// binaries like /bin/false.
process.exit(1);
