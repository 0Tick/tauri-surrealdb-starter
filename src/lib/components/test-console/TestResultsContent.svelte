<script lang="ts">
  type TestStatus = "idle" | "running" | "pass" | "fail";

  type TestRow = {
    key: string;
    category: string;
    label: string;
    status: TestStatus;
    details: string;
  };

  const TEST_CATEGORIES = [
    "Connection",
    "Core Query",
    "Data Operations",
    "Live Queries",
  ];

  let { tests } = $props<{ tests: TestRow[] }>();

  const statusBadge = (status: TestStatus) => {
    if (status === "pass") return "pass";
    if (status === "fail") return "fail";
    if (status === "running") return "running";
    return "idle";
  };

  const testsForCategory = (category: string): TestRow[] =>
    tests.filter((test: TestRow) => test.category === category);
</script>

<h2>Test Results</h2>
{#each TEST_CATEGORIES as category}
  <h3 class="test-category">{category}</h3>
  <ul class="results">
    {#each testsForCategory(category) as test}
      <li>
        <span class={`badge ${statusBadge(test.status)}`}>{test.status}</span>
        <div>
          <strong>{test.label}</strong>
          <p>{test.details}</p>
        </div>
      </li>
    {/each}
  </ul>
{/each}

<style>
  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .test-category {
    margin: 1rem 0 0.55rem;
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #3f4f70;
  }

  .results li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.8rem;
    align-items: start;
    padding: 0.6rem;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.78);
  }

  .results p {
    margin: 0.2rem 0 0;
    color: #33425f;
    font-size: 0.9rem;
  }

  .badge {
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .badge.idle {
    background: #e4e8f1;
    color: #55627b;
  }

  .badge.running {
    background: #ffe5b4;
    color: #7a4b00;
  }

  .badge.pass {
    background: #cbf4db;
    color: #10633a;
  }

  .badge.fail {
    background: #ffd4d4;
    color: #7d1d1d;
  }

  @media (prefers-color-scheme: dark) {
    .test-category,
    .results p {
      color: #bdcbea;
    }

    .results li {
      background: rgba(30, 38, 60, 0.75);
    }

    .badge.idle {
      background: #38445f;
      color: #c3d0eb;
    }

    .badge.running {
      background: #6a4f1d;
      color: #ffe3ad;
    }

    .badge.pass {
      background: #1b5c3d;
      color: #baf1d2;
    }

    .badge.fail {
      background: #7a2d35;
      color: #ffd7dc;
    }
  }
</style>
