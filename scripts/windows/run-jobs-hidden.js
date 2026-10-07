// Windows Script Host (JScript, not VBScript): starts one scheduler tick in
// WSL with no window at all. wscript.exe has no console of its own, and
// window style 0 starts wsl.exe hidden. The scheduled task "Rarebit jobs"
// runs it every 15 minutes (docs/scheduling.md):
//
//   wscript.exe run-jobs-hidden.js <distro> <linux user> <path to run-jobs.sh>
//
// It waits for the tick to finish, so Task Scheduler shows it as running
// until then, and passes on its exit code (0: every job that ran succeeded).
var args = WScript.Arguments;
if (args.length !== 3) WScript.Quit(2);
var command = 'wsl.exe -d ' + args(0) + ' -u ' + args(1) + ' -- ' + args(2);
WScript.Quit(new ActiveXObject('WScript.Shell').Run(command, 0, true));
