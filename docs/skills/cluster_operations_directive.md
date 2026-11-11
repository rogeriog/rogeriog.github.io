# CLUSTER OPERATIONS & RESOURCE MANAGEMENT DIRECTIVE

CRITICAL INSTRUCTION FOR ALL AGENTS:
Read, internalize, and apply these rules to every single job, submission, and script. The cluster costs compute and resources. Wasting them through unoptimized, non-resumable, or blindly submitted jobs is unacceptable. SAVE THIS IN YOUR SOUL AND MEMORY.

## RESOURCE ALLOCATION: GPU vs. CPU

You must explicitly design your pipelines to split tasks between CPU and GPU where appropriate.

- GPU IS MANDATORY FOR: ML models, Machine Learning Interatomic Potentials (MLIPs), and UMA relaxation. Unless explicitly instructed otherwise by the user, these will ALWAYS run on GPU.
- CPU IS MANDATORY FOR: CPU-bounded tasks, such as building caches, data preprocessing, and file management.
- NO SILENT FALLBACKS: If you are calling models that require a GPU but cannot find the right environment or support, DO NOT simply skip/fallback to CPU. This wastes immense time and resources. Stop and report the issue immediately.

## JOB RESUMABILITY (CRITICAL)

Starting from scratch at every submission is a TERRIBLE USE of computational resources.

- ALWAYS DESIGN FOR RESUMABILITY: Every single job must be designed to checkpoint its progress and resume smoothly from where it left off.
- NEVER BLINDLY RESUBMIT: If a job hits a walltime limit, do not just resubmit it for 24 hours without ensuring it is picking up from its last saved state.
- PIPELINE AWARENESS: Always know and report exactly what stage of the pipeline you are in. Ensure the state is saved before proceeding.

## TESTING, DEBUGGING, & SCALING

Do not launch massive, time-consuming jobs without proving the pipeline works first.

- TEST SMALL: If you are unsure if a computation is optimized, test it on a small sample size first.
- USE DEBUG QUEUES: Utilize debug and debug-gpu queues to validate your scripts, environment, and resumability mechanics. If there are no debug queues, just send minimal jobs in the appropriate partition.
- SCALE WITH CAUTION: Only after you are 100% sure the script works, is properly parallelized, and successfully resumes from checkpoints should you launch the time-consuming jobs with an appropriate walltime.

## DIAGNOSIS OVER ACTION

When a job fails, stalls, or takes unexpectedly long (e.g., e7 decode taking too long):

- STOP AND DIAGNOSE: Do not make blind changes. Do not resubmit with more time. Stop and diagnose why it failed or is taking so long.
- PROVIDE CLEAR ANSWERS: When asked for a diagnosis, provide a thorough breakdown of the job's state, environment, and errors before proceeding with new actions.
- LEARN FROM MISTAKES: Continuously update your memory context with any mistakes made regarding environment selection or job submission.

## ENVIRONMENT MANAGEMENT

- Ensure you have an environment with all the right support to run your specific tasks (there might be an environment with the correct support already in conda or uv, check for it and remember it).
- Verify dependencies before submitting to the queue, ideally during the debug phase.

## FINAL REMINDER

Be wise about GPU/CPU use, parallelization, and resumable jobs ALWAYS. Things cost compute. Do not proceed with large tasks until smaller validations confirm optimal resource usage.
