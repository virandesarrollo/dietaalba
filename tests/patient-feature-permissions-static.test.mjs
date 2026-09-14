import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

test('loads patient features before recipe reviews and fails closed', () => {
  assert.match(page, /deriveFeatureCapabilities/);
  assert.match(page, /rpc\('get_my_features'\)[\s\S]+?deriveFeatureCapabilities/);
  assert.match(page, /featuresError[\s\S]+?deriveFeatureCapabilities\(\[\]\)/);
  assert.match(page, /canOpenNotes[\s\S]+?from\('recipe_reviews'\)/);
  assert.match(page, /normalizeFeatureRows\(featuresData\)/);
});

test('send-report-only users see stored ratings without edit controls', () => {
  assert.match(page, /data-testid="review-rating-readonly"[\s\S]+?<Star/);
  assert.doesNotMatch(page, /canRateRecipes\s*&&\s*<div data-testid="review-rating-readonly"/);
  assert.match(page, /canRateRecipes\s*&&[\s\S]+?openReviewModal\(rev\.recipe_title\)/);
});

test('shows notes and rating controls only with their capabilities', () => {
  assert.match(page, /canOpenNotes\s*&&[\s\S]+?Notas chica/);
  assert.match(page, /canRateRecipes\s*&&[\s\S]+?openReviewModal\(meal\.title\)/);
  assert.match(page, /canRateRecipes\s*&&\s*activeRecipe/);
  assert.match(page, /if\s*\(!canRateRecipes\)\s*return;/);
});

test('keeps existing notes readable but gates report controls', () => {
  assert.match(page, /currentTab === 'notes'\s*&&\s*canOpenNotes/);
  assert.match(page, /canSendReport\s*&&[\s\S]+?copyToClipboard\(fullReportText/);
  assert.match(page, /canSendReport\s*&&[\s\S]+?https:\/\/wa\.me/);
  assert.match(page, /canSendReport\s*&&[\s\S]+?Vista previa del mensaje/);
  assert.match(page, /canRateRecipes\s*&&[\s\S]+?deleteReview\(rev\.recipe_title\)/);
});

test('returns to the plan if notes access is revoked', () => {
  assert.match(page, /useEffect\(\(\) => \{\s*if \(!canOpenNotes\)[\s\S]+?setCurrentTab\('plan'\)[\s\S]+?\}, \[canOpenNotes\]\)/);
});

test('auth generations clear patient state and always trigger a fresh fetch', () => {
  assert.match(page, /requestGuard\.invalidate\(\)[\s\S]+?setMeals\(\[\]\)[\s\S]+?setReviews\(\{\}\)[\s\S]+?setRecipes\(\[\]\)/);
  assert.match(page, /setAuthGeneration\(generation\)/);
  assert.match(page, /\[selectedDate, session, authGeneration\]/);
  assert.match(page, /isGenerationCurrent\(initialSessionGeneration\)/);
});

test('review mutations and date transitions are guarded against stale commits', () => {
  assert.match(page, /mutationGuardRef/);
  assert.match(page, /saveReview[\s\S]+?startRequest[\s\S]+?await supabase[\s\S]+?isCurrent/);
  assert.match(page, /deleteReview[\s\S]+?startRequest[\s\S]+?await supabase[\s\S]+?isCurrent/);
  assert.match(page, /const selectDate = \(nextDate: string\)[\s\S]+?invalidateRequests\(\)[\s\S]+?setLoading\(true\)[\s\S]+?setMeals\(\[\]\)[\s\S]+?setSelectedDate\(nextDate\)/);
  assert.equal(page.match(/setSelectedDate\(/g)?.length, 1);
});

test('review writes share a synchronous lock and disable mutation controls', () => {
  assert.match(page, /reviewMutationBusyRef/);
  assert.match(page, /const \[mutatingReviews, setMutatingReviews\]/);
  assert.match(page, /saveReview[\s\S]+?tryAcquire\(\)[\s\S]+?try \{[\s\S]+?finally/);
  assert.match(page, /deleteReview[\s\S]+?tryAcquire\(\)[\s\S]+?try \{[\s\S]+?finally/);
  assert.match(page, /disabled=\{mutatingReviews\}/);
  assert.match(page, /mutationGuardRef\.current\.invalidate\(\)[\s\S]+?reviewMutationBusyRef\.current\.reset\(\)[\s\S]+?setMutatingReviews\(false\)/);
});

test('builds the recipe picker only from the authenticated user daily plan', () => {
  assert.doesNotMatch(page, /\.from\('recipes'\)/);
  assert.match(
    page,
    /\.from\('daily_plan'\)[\s\S]+?\.select\('title, meal_type, ingredients, recipe_url, is_free_meal'\)[\s\S]+?\.eq\('user_id', userId\)/,
  );
});

test('loads day menus only from authenticated user plan dates without templates', () => {
  assert.equal(page.match(/WEEKDAY_TEMPLATES/g)?.length, 1);
  assert.match(page, /loadAvailableSourceDays[\s\S]+?\.from\('daily_plan'\)[\s\S]+?\.eq\('user_id', userId\)/);
  assert.match(page, /handleApplyDayMenu[\s\S]+?const sourceDate = selectedSourceDate[\s\S]+?\.eq\('date', sourceDate\)[\s\S]+?\.eq\('user_id', userId\)/);
  assert.doesNotMatch(page, /sourceMealsData[\s\S]+?template\.meals/);
  assert.doesNotMatch(page, /const template = WEEKDAY_TEMPLATES/);
});
