#pragma once

#include <arm_neon.h>

// MinaCalc only uses the scalar SSE helpers below for its fast square root.
// Keep the shim small instead of vendoring the full sse2neon project.
typedef float32x4_t __m128;

static inline __m128 _mm_load_ss(const float *value) {
    return vsetq_lane_f32(*value, vdupq_n_f32(0.0f), 0);
}

static inline void _mm_store_ss(float *value, __m128 input) {
    vst1q_lane_f32(value, input, 0);
}

static inline __m128 _mm_mul_ss(__m128 left, __m128 right) {
    return vsetq_lane_f32(
        vget_lane_f32(vget_low_f32(left), 0) * vget_lane_f32(vget_low_f32(right), 0),
        left,
        0
    );
}

static inline __m128 _mm_rsqrt_ss(__m128 input) {
    float32x4_t estimate = vrsqrteq_f32(input);
    estimate = vmulq_f32(estimate, vrsqrtsq_f32(vmulq_f32(input, estimate), estimate));
    return vsetq_lane_f32(vgetq_lane_f32(estimate, 0), input, 0);
}
