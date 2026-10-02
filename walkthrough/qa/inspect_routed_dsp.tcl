# Read the existing routed checkpoint. Do not synthesize, implement or save it.
set root [file normalize [file join [file dirname [info script]] .. ..]]
set checkpoint [file join $root hls work_csynth hls impl verilog project.runs impl_1 bd_0_wrapper_routed.dcp]
open_checkpoint $checkpoint
set cells [get_cells -hier -filter {REF_NAME == DSP48E1}]
puts "QA_DSP_TOTAL [llength $cells]"
foreach cell $cells {
    puts "QA_DSP_CELL [get_property NAME $cell]"
}
close_design
exit
