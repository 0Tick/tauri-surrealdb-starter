<script lang="ts">
  let { activeLiveStreamId, liveNotificationCount, liveEvents } = $props<{
    activeLiveStreamId: string | null;
    liveNotificationCount: number;
    liveEvents: string[];
  }>();
</script>

<h2>Live Feed</h2>
<p class="meta">Active stream: {activeLiveStreamId ?? "none"}</p>
<p class="meta">Notification count: {liveNotificationCount}</p>
<div class="feed">
  {#if liveEvents.length === 0}
    <p class="empty">No live events yet</p>
  {:else}
    {#each liveEvents as eventLine}
      <p>{eventLine}</p>
    {/each}
  {/if}
</div>

<style>
  .meta {
    margin: 0.3rem 0;
    color: #2b3b59;
    font-size: 0.92rem;
  }

  .feed {
    margin-top: 0.7rem;
    max-height: 250px;
    overflow: auto;
    border-radius: 12px;
    border: 1px solid rgba(51, 66, 95, 0.2);
    background: rgba(255, 255, 255, 0.85);
    padding: 0.55rem;
  }

  .feed p {
    margin: 0;
    padding: 0.32rem 0;
    border-bottom: 1px dashed rgba(51, 66, 95, 0.18);
    font-size: 0.88rem;
  }

  .feed p:last-child {
    border-bottom: none;
  }

  .empty {
    color: #667289;
  }

  @media (prefers-color-scheme: dark) {
    .meta,
    .empty {
      color: #bdcbea;
    }

    .feed {
      border-color: rgba(181, 199, 230, 0.25);
      background: rgba(17, 23, 40, 0.8);
    }

    .feed p {
      border-bottom-color: rgba(181, 199, 230, 0.2);
    }
  }
</style>
