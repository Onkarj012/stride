import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { useDashboard } from "./context/DashboardContext";

export default function ProfilePage() {
  const {
    user,
    openUserProfile,
    profile,
    profileForm,
    setProfileForm,
    profileLoading,
    profileError,
    profileSuccess,
    profileAILoading,
    profileAIExplanation,
    handleSaveProfile,
    handleAIFillProfile,
  } = useDashboard();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-black tracking-tighter">
            PROFILE
          </h2>
          <button
            onClick={() => openUserProfile()}
            className="px-4 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-black hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors"
          >
            ACCOUNT SETTINGS
          </button>
        </div>

        <div className="border-2 border-black dark:border-gray-700 p-6 mb-6 bg-neutral-50 dark:bg-gray-900 transition-colors">
          <div className="flex items-center gap-5">
            {user?.imageUrl && (
              <img
                src={user.imageUrl}
                alt=""
                className="w-20 h-20 border-2 border-black dark:border-gray-700 object-cover shrink-0"
              />
            )}
            <div>
              <h3 className="text-xl font-black">
                {user?.fullName || "Operator"}
              </h3>
              <p className="text-sm font-bold text-neutral-500 dark:text-gray-400">
                {user?.emailAddresses?.[0]?.emailAddress}
              </p>
              <p className="text-xs font-bold text-neutral-400 dark:text-gray-500 mt-1">
                MEMBER SINCE{" "}
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-black mb-6 border-b-2 border-black dark:border-gray-700 pb-2">
            BODY METRICS
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                WEIGHT (KG)
              </label>
              <input
                type="number"
                value={profileForm.weight}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    weight: e.target.value,
                  })
                }
                placeholder="75"
                className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                HEIGHT (CM)
              </label>
              <input
                type="number"
                value={profileForm.height}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    height: e.target.value,
                  })
                }
                placeholder="175"
                className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                AGE
              </label>
              <input
                type="number"
                value={profileForm.age}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    age: e.target.value,
                  })
                }
                placeholder="28"
                className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
              />
            </div>
            {profileForm.weight && profileForm.height && (
              <div className="border-2 border-black dark:border-gray-700 p-6 bg-red-600 dark:bg-red-800 text-white flex flex-col justify-center">
                <div className="text-xs font-bold text-red-200 dark:text-red-300">
                  BMI
                </div>
                <div className="text-3xl font-black mt-1">
                  {(
                    Number(profileForm.weight) /
                    (Number(profileForm.height) / 100) ** 2
                  ).toFixed(1)}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
              ACTIVITY LEVEL
            </label>
            <select
              value={profileForm.activityLevel}
              onChange={(e) =>
                setProfileForm({
                  ...profileForm,
                  activityLevel: e.target.value,
                })
              }
              className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none mb-2"
            >
              <option value="sedentary">
                SEDENTARY — Little to no exercise, desk job
              </option>
              <option value="light">
                LIGHT — Light exercise 1-3 days/week
              </option>
              <option value="moderate">
                MODERATE — Exercise 3-5 days/week
              </option>
              <option value="active">
                ACTIVE — Intense exercise 6-7 days/week
              </option>
              <option value="intense">
                INTENSE — Very intense daily training, physical job
              </option>
            </select>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-6 border-b-2 border-black dark:border-gray-700 pb-2">
            <h3 className="text-lg font-black">DAILY MACRO TARGETS</h3>
            <button
              onClick={handleAIFillProfile}
              disabled={
                profileAILoading ||
                !profileForm.weight ||
                !profileForm.height ||
                !profileForm.age
              }
              className="flex items-center gap-2 px-4 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
            >
              {profileAILoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              AI CALCULATE
            </button>
          </div>

          {profileAIExplanation && (
            <div className="mb-4 p-4 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
              AI: {profileAIExplanation}
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                CALORIES (KCAL)
              </label>
              <input
                type="number"
                value={profileForm.calorieTarget}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    calorieTarget: e.target.value,
                  })
                }
                placeholder="2400"
                className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                PROTEIN (G)
              </label>
              <input
                type="number"
                value={profileForm.proteinTarget}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    proteinTarget: e.target.value,
                  })
                }
                placeholder="180"
                className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                CARBS (G)
              </label>
              <input
                type="number"
                value={profileForm.carbTarget}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    carbTarget: e.target.value,
                  })
                }
                placeholder="280"
                className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                FAT (G)
              </label>
              <input
                type="number"
                value={profileForm.fatTarget}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    fatTarget: e.target.value,
                  })
                }
                placeholder="80"
                className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleSaveProfile}
            disabled={profileLoading}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-red-600 text-white text-sm font-bold border-2 border-red-600 hover:bg-black dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors disabled:opacity-50"
          >
            {profileLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "SAVE METRICS & TARGETS"
            )}
          </button>
          <button
            onClick={() => openUserProfile()}
            className="flex items-center gap-2 px-6 py-4 border-2 border-black dark:border-gray-700 text-sm font-bold hover:bg-black hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors"
          >
            MANAGE ACCOUNT
          </button>
        </div>

        {profileError && (
          <div className="mt-4 p-3 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
            {profileError}
          </div>
        )}
        {profileSuccess && (
          <div className="mt-4 p-3 border-2 border-green-600 bg-green-50 dark:bg-green-950 text-xs font-bold text-green-700 dark:text-green-400">
            PROFILE SAVED SUCCESSFULLY
          </div>
        )}

        {(profile?.weight || profile?.height) && (
          <div className="border-2 border-black dark:border-gray-700 p-6 mt-8 bg-neutral-50 dark:bg-gray-900">
            <h3 className="text-sm font-bold mb-4">
              CURRENT SAVED PROFILE
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm font-bold">
              {profile.weight && (
                <div>
                  WEIGHT:{" "}
                  <span className="text-red-600">
                    {profile.weight} KG
                  </span>
                </div>
              )}
              {profile.height && (
                <div>
                  HEIGHT:{" "}
                  <span className="text-red-600">
                    {profile.height} CM
                  </span>
                </div>
              )}
              {profile.age && (
                <div>
                  AGE:{" "}
                  <span className="text-red-600">{profile.age}</span>
                </div>
              )}
              <div>
                ACTIVITY:{" "}
                <span className="text-red-600">
                  {profile.activityLevel?.toUpperCase()}
                </span>
              </div>
              {profile.calorieTarget && (
                <div>
                  CAL TARGET:{" "}
                  <span className="text-red-600">
                    {profile.calorieTarget} KCAL
                  </span>
                </div>
              )}
              {profile.proteinTarget && (
                <div>
                  PROTEIN:{" "}
                  <span className="text-red-600">
                    {profile.proteinTarget}G
                  </span>
                </div>
              )}
              {profile.carbTarget && (
                <div>
                  CARBS:{" "}
                  <span className="text-red-600">
                    {profile.carbTarget}G
                  </span>
                </div>
              )}
              {profile.fatTarget && (
                <div>
                  FAT:{" "}
                  <span className="text-red-600">
                    {profile.fatTarget}G
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
