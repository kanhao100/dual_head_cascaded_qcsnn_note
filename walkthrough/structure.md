# Computational structure

**Top (topFunction)**: {'BRAM_18K': 192, 'DSP': 227, 'FF': 35388, 'LUT': 55187, 'URAM': 0}

## Operator inventory (csynth Expression tables)

| op | count | LUT | DSP | widest operand |
|---|---|---|---|---|
| add | 160 | 2979 | 0 | 55 |
| compare | 120 | 2026 | 0 | 37 |
| shift-left | 11 | 1357 | 0 | 40 |
| shift-right | 8 | 1210 | 0 | 55 |
| select | 89 | 894 | 0 | 45 |
| sub | 8 | 224 | 0 | 45 |
| and | 42 | 189 | 0 | 37 |
| xor | 61 | 122 | 0 | 2 |
| or | 41 | 82 | 0 | 1 |

DSP48 used by fabric-mapped expressions: **0** (0 means every multiply was mapped to LUT/shift-add)

## Pragmas
ARRAY_PARTITION×22, DATAFLOW×1, INLINE×9, INTERFACE×24, PIPELINE×22, STREAM×34, UNROLL×8

(plain `INLINE` pragmas: 7 — small helpers merged into their caller; the listing below omits them)

- `ARRAY_PARTITION variable=buf cyclic factor=8 dim=1` in `axi_to_input_data` (topclass24_sd.cpp:24)
- `PIPELINE II=1` in `axi_to_input_data` (topclass24_sd.cpp:27)
- `UNROLL ` in `axi_to_input_data` (topclass24_sd.cpp:31)
- `PIPELINE II=1` in `axi_to_input_data` (topclass24_sd.cpp:49)
- `UNROLL ` in `axi_to_input_data` (topclass24_sd.cpp:55)
- `UNROLL ` in `axi_to_input_data` (topclass24_sd.cpp:61)
- `INTERFACE axis port=dmaInStream` in `topFunction` (topclass24_sd.cpp:115)
- `INTERFACE axis port=dmaOut2Stream` in `topFunction` (topclass24_sd.cpp:116)
- `INTERFACE axis port=dmaOut4Stream` in `topFunction` (topclass24_sd.cpp:117)
- `INTERFACE ap_ctrl_hs port=return` in `topFunction` (topclass24_sd.cpp:118)
- `DATAFLOW ` in `topFunction` (topclass24_sd.cpp:119)
- `STREAM variable=dataStream depth=FIXED_LENGTH1` in `topFunction` (topclass24_sd.cpp:122)
- `ARRAY_PARTITION variable=rr_stage1 complete dim=1` in `topFunction` (topclass24_sd.cpp:125)
- `ARRAY_PARTITION variable=rr_stage2 complete dim=1` in `topFunction` (topclass24_sd.cpp:128)
- `STREAM variable=pred2Stream depth=2` in `topFunction` (topclass24_sd.cpp:131)
- `STREAM variable=pred4Stream depth=2` in `topFunction` (topclass24_sd.cpp:134)
- `INTERFACE axis      port=input_stream` in `forward` (qcsnn24_rrboth_sd.h:68)
- `INTERFACE axis      port=pred2_stream` in `forward` (qcsnn24_rrboth_sd.h:69)
- `INTERFACE axis      port=pred4_stream` in `forward` (qcsnn24_rrboth_sd.h:70)
- `INTERFACE s_axilite port=rr_stage1 bundle=CTRL` in `forward` (qcsnn24_rrboth_sd.h:71)
- `INTERFACE s_axilite port=rr_stage2 bundle=CTRL` in `forward` (qcsnn24_rrboth_sd.h:72)
- `INTERFACE s_axilite port=return bundle=CTRL` in `forward` (qcsnn24_rrboth_sd.h:73)
- `ARRAY_PARTITION variable=sig_buf cyclic factor=8 dim=1` in `forward` (qcsnn24_rrboth_sd.h:79)
- `ARRAY_PARTITION variable=rr_s1 complete dim=1` in `forward` (qcsnn24_rrboth_sd.h:82)
- `ARRAY_PARTITION variable=rr_s2 complete dim=1` in `forward` (qcsnn24_rrboth_sd.h:85)
- `PIPELINE II=1` in `forward` (qcsnn24_rrboth_sd.h:89)
- `UNROLL ` in `forward` (qcsnn24_rrboth_sd.h:95)
- `ARRAY_PARTITION variable=body_cache cyclic factor=8 dim=2` in `forward` (qcsnn24_rrboth_sd.h:112)
- `STREAM variable=s_in depth=SIGNAL_LEN` in `forward` (qcsnn24_rrboth_sd.h:122)
- `STREAM variable=s0 depth=FIXED_LENGTH2` in `forward` (qcsnn24_rrboth_sd.h:126)
- `STREAM variable=s1 depth=FIXED_LENGTH2` in `forward` (qcsnn24_rrboth_sd.h:128)
- `STREAM variable=s2 depth=FIXED_LENGTH2` in `forward` (qcsnn24_rrboth_sd.h:130)
- `STREAM variable=s3 depth=FIXED_LENGTH3` in `forward` (qcsnn24_rrboth_sd.h:132)
- `STREAM variable=s4 depth=FIXED_LENGTH3` in `forward` (qcsnn24_rrboth_sd.h:135)
- `STREAM variable=s5 depth=FIXED_LENGTH4` in `forward` (qcsnn24_rrboth_sd.h:137)
- `STREAM variable=s6 depth=FIXED_LENGTH4` in `forward` (qcsnn24_rrboth_sd.h:139)
- `STREAM variable=s7 depth=FIXED_LENGTH4` in `forward` (qcsnn24_rrboth_sd.h:141)
- `STREAM variable=s8 depth=FIXED_LENGTH5` in `forward` (qcsnn24_rrboth_sd.h:143)
- `STREAM variable=s9 depth=FIXED_LENGTH5` in `forward` (qcsnn24_rrboth_sd.h:146)
- `STREAM variable=s10 depth=FIXED_LENGTH6` in `forward` (qcsnn24_rrboth_sd.h:148)
- `STREAM variable=s11 depth=FIXED_LENGTH6` in `forward` (qcsnn24_rrboth_sd.h:150)
- `STREAM variable=s12 depth=FIXED_LENGTH6` in `forward` (qcsnn24_rrboth_sd.h:152)
- `STREAM variable=s_body depth=TRUNK_OUT` in `forward` (qcsnn24_rrboth_sd.h:154)
- `STREAM variable=s_bin_qi_in depth=TRUNK_OUT` in `forward` (qcsnn24_rrboth_sd.h:158)
- `STREAM variable=s_bin_qi_out depth=TRUNK_OUT` in `forward` (qcsnn24_rrboth_sd.h:160)
- `STREAM variable=s_bin_fc depth=STAGE1_IN` in `forward` (qcsnn24_rrboth_sd.h:162)
- `STREAM variable=s_bin_lif_in depth=2` in `forward` (qcsnn24_rrboth_sd.h:164)
- `STREAM variable=s_bin_out depth=2` in `forward` (qcsnn24_rrboth_sd.h:166)
- `STREAM variable=s_m_qi1_in depth=TRUNK_OUT` in `forward` (qcsnn24_rrboth_sd.h:170)
- `STREAM variable=s_m_qi1_out depth=TRUNK_OUT` in `forward` (qcsnn24_rrboth_sd.h:172)
- `STREAM variable=s_m_fc1 depth=STAGE2_IN` in `forward` (qcsnn24_rrboth_sd.h:174)
- `STREAM variable=s_m_lif1_out depth=FIXED_LENGTH8` in `forward` (qcsnn24_rrboth_sd.h:176)
- `STREAM variable=s_m_qi2 depth=FIXED_LENGTH8` in `forward` (qcsnn24_rrboth_sd.h:179)
- `STREAM variable=s_m_fc2 depth=FIXED_LENGTH8` in `forward` (qcsnn24_rrboth_sd.h:181)
- `STREAM variable=s_m_lif2_in depth=FIXED_LENGTH9` in `forward` (qcsnn24_rrboth_sd.h:183)
- `STREAM variable=s_m_out depth=FIXED_LENGTH9` in `forward` (qcsnn24_rrboth_sd.h:185)
- `PIPELINE II=1` in `forward` (qcsnn24_rrboth_sd.h:195)
- `PIPELINE II=1` in `forward` (qcsnn24_rrboth_sd.h:278)
- `PIPELINE II=1` in `forward` (qcsnn24_rrboth_sd.h:290)
- `PIPELINE II=1` in `forward` (qcsnn24_rrboth_sd.h:295)
- `PIPELINE II=1` in `forward` (qcsnn24_rrboth_sd.h:344)
- `PIPELINE II=1` in `forward` (qcsnn24_rrboth_sd.h:354)
- `PIPELINE II=1` in `forward` (qcsnn24_rrboth_sd.h:359)
- `STREAM variable=input_stream depth=FIXED_LENGTH1  // 180` in `evaluate` (modeleval24_sd.h:28)
- `PIPELINE II=1` in `evaluate` (modeleval24_sd.h:32)
- `STREAM variable=out2_stream depth=2` in `evaluate` (modeleval24_sd.h:41)
- `STREAM variable=out4_stream depth=2` in `evaluate` (modeleval24_sd.h:44)
- `ARRAY_PARTITION variable=weights complete dim=1` in `forward` (conv1d_sd.h:28)
- `ARRAY_PARTITION variable=weights complete dim=2` in `forward` (conv1d_sd.h:29)
- `ARRAY_PARTITION variable=scale_multiplier complete dim=1` in `forward` (conv1d_sd.h:30)
- `ARRAY_PARTITION variable=right_shift complete dim=1` in `forward` (conv1d_sd.h:31)
- `INTERFACE mode=s_axilite port=scale_multiplier` in `forward` (conv1d_sd.h:33)
- `INTERFACE mode=s_axilite port=right_shift` in `forward` (conv1d_sd.h:34)
- `INTERFACE mode=s_axilite port=bias` in `forward` (conv1d_sd.h:35)
- `INTERFACE mode=s_axilite port=input_zero_point` in `forward` (conv1d_sd.h:36)
- `INTERFACE mode=s_axilite port=weight_sum` in `forward` (conv1d_sd.h:37)
- `ARRAY_PARTITION variable=input_buffer complete dim=1` in `forward` (conv1d_sd.h:43)
- `PIPELINE II=1` in `forward` (conv1d_sd.h:48)
- `PIPELINE II=1` in `forward` (conv1d_sd.h:60)
- `UNROLL ` in `forward` (conv1d_sd.h:65)
- `UNROLL ` in `forward` (conv1d_sd.h:67)
- `ARRAY_PARTITION variable=weights complete dim=1` in `forward` (linear1d_sd.h:36)
- `ARRAY_PARTITION variable=scale_multiplier complete dim=1` in `forward` (linear1d_sd.h:37)
- `ARRAY_PARTITION variable=right_shift complete dim=1` in `forward` (linear1d_sd.h:38)
- `INTERFACE mode=s_axilite port=scale_multiplier` in `forward` (linear1d_sd.h:40)
- `INTERFACE mode=s_axilite port=right_shift` in `forward` (linear1d_sd.h:41)
- `INTERFACE mode=s_axilite port=bias` in `forward` (linear1d_sd.h:42)
- `INTERFACE mode=s_axilite port=input_zero_point` in `forward` (linear1d_sd.h:43)
- `INTERFACE mode=s_axilite port=weight_sum` in `forward` (linear1d_sd.h:44)
- `ARRAY_PARTITION variable=in_vec complete dim=1` in `forward` (linear1d_sd.h:48)
- `PIPELINE II=1` in `forward` (linear1d_sd.h:52)
- `ARRAY_PARTITION variable=acc complete dim=1` in `forward` (linear1d_sd.h:58)
- `UNROLL ` in `forward` (linear1d_sd.h:62)
- `PIPELINE II=1` in `forward` (linear1d_sd.h:70)
- `UNROLL ` in `forward` (linear1d_sd.h:75)
- `PIPELINE II=1` in `forward` (linear1d_sd.h:87)
- `PIPELINE II=1` in `reset` (lif1d_integer.h:27)
- `INLINE off` in `forward` (lif1d_integer.h:42)
- `PIPELINE II=1` in `forward` (lif1d_integer.h:62)
- `ARRAY_PARTITION variable=buffer complete` in `forward` (maxpool1d_sd.h:20)
- `PIPELINE II=1` in `forward` (maxpool1d_sd.h:28)
- `PIPELINE II=1` in `forward` (maxpool1d_sd.h:35)
- `ARRAY_PARTITION variable=weight complete dim=1` in `forward` (batchnorm1d_sd.h:83)
- `ARRAY_PARTITION variable=bias complete dim=1` in `forward` (batchnorm1d_sd.h:84)
- `ARRAY_PARTITION variable=scale_multiplier complete dim=1` in `forward` (batchnorm1d_sd.h:85)
- `ARRAY_PARTITION variable=right_shift complete dim=1` in `forward` (batchnorm1d_sd.h:86)
- `INTERFACE mode=s_axilite port=weight` in `forward` (batchnorm1d_sd.h:87)
- `INTERFACE mode=s_axilite port=bias` in `forward` (batchnorm1d_sd.h:88)
- `INTERFACE mode=s_axilite port=scale_multiplier` in `forward` (batchnorm1d_sd.h:89)
- `INTERFACE mode=s_axilite port=right_shift` in `forward` (batchnorm1d_sd.h:90)
- `PIPELINE II=1` in `forward` (batchnorm1d_sd.h:97)
- `INLINE off` in `forward` (quantidentity1d_sd.h:24)
- `PIPELINE II=1` in `forward` (quantidentity1d_sd.h:43)

## Datatypes

- `ap_int8_c` = ap_int<8>
- `acc32_t` = ap_int<32>

## Constant multiplies implemented as shift-add (heuristic)


## Slowest modules (estimated clock)

- Loop_in_write_proc: 7.3 ns
- topFunction: 7.3 ns
- Block_entry_proc: 7.268 ns
- forward_4_Pipeline_VITIS_LOOP_289_5: 7.222 ns
- forward_4_Pipeline_VITIS_LOOP_353_8: 7.222 ns

## Hierarchy (RTL instantiation)

- `topFunction` → topFunction_Block_entry_buf_i_0_rd_buf_i_1_rd_buf_i_2_rd_buf_i_3_rd_buf_i_4_rd_buf_i_5_rd_bu_1_1, topFunction_Block_entry_proc, topFunction_Loop_VITIS_LOOP_26_1_proc, topFunction_Loop_in_write_proc, topFunction_forward_4
- `topFunction_Block_entry_buf_i_0_rd_buf_i_1_rd_buf_i_2_rd_buf_i_3_rd_buf_i_4_rd_buf_i_5_rd_bu_1` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_Block_entry_buf_i_0_rd_buf_i_1_rd_buf_i_2_rd_buf_i_3_rd_buf_i_4_rd_buf_i_5_rd_bu_1_1` → topFunction_Block_entry_buf_i_0_rd_buf_i_1_rd_buf_i_2_rd_buf_i_3_rd_buf_i_4_rd_buf_i_5_rd_bu_1
- `topFunction_forward` → topFunction_forward_Pipeline_VITIS_LOOP_41_1
- `topFunction_forward_1` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_13` → topFunction_forward_13_Pipeline_VITIS_LOOP_46_1_VITIS_LOOP_47_2, topFunction_forward_13_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4
- `topFunction_forward_13_Pipeline_VITIS_LOOP_46_1_VITIS_LOOP_47_2` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_13_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_14` → topFunction_forward_14_Pipeline_VITIS_LOOP_46_1_VITIS_LOOP_47_2, topFunction_forward_14_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4
- `topFunction_forward_14_Pipeline_VITIS_LOOP_46_1_VITIS_LOOP_47_2` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_14_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_2` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_3` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4` → topFunction_forward, topFunction_forward_1, topFunction_forward_10, topFunction_forward_11, topFunction_forward_12, topFunction_forward_13, topFunction_forward_14, topFunction_forward_2, topFunction_forward_3, topFunction_forward_4_Pipeline_CHANNEL_LOOP_FEATURE_LOOP, topFunction_forward_4_Pipeline_CHANNEL_LOOP_FEATURE_LOOP6, topFunction_forward_4_Pipeline_CHANNEL_LOOP_FEATURE_LOOP9, topFunction_forward_4_Pipeline_DOT_I, topFunction_forward_4_Pipeline_OUT_LOOP, topFunction_forward_4_Pipeline_POOL_LOOP, topFunction_forward_4_Pipeline_POOL_LOOP11, topFunction_forward_4_Pipeline_POOL_LOOP8, topFunction_forward_4_Pipeline_READ_CHANNEL, topFunction_forward_4_Pipeline_READ_CHANNEL10, topFunction_forward_4_Pipeline_READ_CHANNEL7, topFunction_forward_4_Pipeline_READ_IN, topFunction_forward_4_Pipeline_VITIS_LOOP_194_3, topFunction_forward_4_Pipeline_VITIS_LOOP_25_1, topFunction_forward_4_Pipeline_VITIS_LOOP_25_112, topFunction_forward_4_Pipeline_VITIS_LOOP_25_113, topFunction_forward_4_Pipeline_VITIS_LOOP_25_1_VITIS_LOOP_26_2, topFunction_forward_4_Pipeline_VITIS_LOOP_25_1_VITIS_LOOP_26_24, topFunction_forward_4_Pipeline_VITIS_LOOP_25_1_VITIS_LOOP_26_25, topFunction_forward_4_Pipeline_VITIS_LOOP_277_4, topFunction_forward_4_Pipeline_VITIS_LOOP_289_5, topFunction_forward_4_Pipeline_VITIS_LOOP_294_6, topFunction_forward_4_Pipeline_VITIS_LOOP_343_7, topFunction_forward_4_Pipeline_VITIS_LOOP_353_8, topFunction_forward_4_Pipeline_VITIS_LOOP_358_9, topFunction_forward_4_Pipeline_VITIS_LOOP_47_2, topFunction_forward_4_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4, topFunction_forward_4_Pipeline_VITIS_LOOP_88_1, topFunction_forward_5, topFunction_forward_6, topFunction_forward_7, topFunction_forward_8, topFunction_forward_9
- `topFunction_forward_4_Pipeline_CHANNEL_LOOP_FEATURE_LOOP` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_CHANNEL_LOOP_FEATURE_LOOP6` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_CHANNEL_LOOP_FEATURE_LOOP9` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_DOT_I` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_OUT_LOOP` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_POOL_LOOP` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_POOL_LOOP11` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_POOL_LOOP8` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_READ_CHANNEL` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_READ_CHANNEL10` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_READ_CHANNEL7` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_READ_IN` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_194_3` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_25_1` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_25_112` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_25_113` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_25_1_VITIS_LOOP_26_2` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_25_1_VITIS_LOOP_26_24` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_25_1_VITIS_LOOP_26_25` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_277_4` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_289_5` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_294_6` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_343_7` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_353_8` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_358_9` → topFunction_flow_control_loop_pipe_sequential_init
- `topFunction_forward_4_Pipeline_VITIS_LOOP_47_2` → topFunction_flow_control_loop_pipe_sequential_init
