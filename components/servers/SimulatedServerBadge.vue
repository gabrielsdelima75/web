<script setup lang="ts">
import { Badge } from "~/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

// What the server says it runs: the simulated game server reports
// "simulator", and nobody can join a match it plays.
defineProps<{
  runtime?: string | null;
}>();
</script>

<template>
  <TooltipProvider v-if="runtime === 'simulator'" :delay-duration="150">
    <Tooltip>
      <TooltipTrigger as-child>
        <Badge
          variant="outline"
          class="shrink-0 border-dashed px-1.5 py-0 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground"
          data-simulated-server
          >{{ $t("server.simulated") }}</Badge
        >
      </TooltipTrigger>
      <TooltipContent class="max-w-xs">
        {{ $t("server.simulated_description") }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
